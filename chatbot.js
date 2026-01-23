const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const pdf = require('pdf-parse');

// --- CONFIGURAÇÃO DO BOT ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox']
    }
});

// Estado para controlar o fluxo da conversa
const userState = {};

// Função de Delay (pausa) simples
const delay = ms => new Promise(res => setTimeout(res, ms));

// --- FUNÇÃO DE BUSCA NO PDF ---
async function buscarErroNoPDF(caminhoArquivo, termoBusca) {
    try {
        if (!fs.existsSync(caminhoArquivo)) {
            return "⚠️ Erro técnico: O arquivo do manual não foi encontrado na pasta.";
        }

        const dataBuffer = fs.readFileSync(caminhoArquivo);
        const data = await pdf(dataBuffer);
        const textoCompleto = data.text;

        // Busca mais flexível (ignora maiúsculas/minúsculas)
        const regex = new RegExp(termoBusca, 'gi');
        let match;
        let resultados = [];

        // Procura até 2 ocorrências para não poluir o chat
        while ((match = regex.exec(textoCompleto)) !== null) {
            // Pega um contexto antes e depois para entender o erro
            const inicio = Math.max(0, match.index - 150);
            const fim = Math.min(textoCompleto.length, match.index + 250);
            let trecho = textoCompleto.substring(inicio, fim).replace(/\s+/g, ' ').trim();
            resultados.push(`"...${trecho}..."`);
            if (resultados.length >= 2) break;
        }

        if (resultados.length > 0) {
            return `📄 *Encontrei no Manual:*\n\n${resultados.join('\n\n---\n\n')}`;
        } else {
            return `❌ Não encontrei o termo *"${termoBusca}"* no manual. Tente apenas o código (ex: 980) ou uma palavra-chave simples.`;
        }

    } catch (e) {
        console.error("Erro ao ler PDF:", e);
        return "Erro interno ao tentar ler o manual.";
    }
}

// --- INICIALIZAÇÃO ---
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('>> Leia o QR Code para conectar!');
});

client.on('ready', () => {
    console.log('>> Tudo pronto! Bot Online.');
});

client.initialize();

// --- LÓGICA DE MENSAGENS ---
client.on('message', async msg => {
    // 1. Filtros de segurança (ignora grupos e mensagens próprias)
    if (msg.from.endsWith('@g.us') || msg.from === client.info.wid._serialized) return;

    try {
        const chatId = msg.from;
        const texto = msg.body.toLowerCase().trim();
        
        // Tenta pegar o nome, se falhar usa "Amigo"
        let nome = "Amigo";
        try {
            const contact = await msg.getContact();
            if (contact.pushname) nome = contact.pushname.split(" ")[0];
        } catch (e) {}

        // 2. DETECÇÃO DE RESET/INÍCIO
        if (['menu', 'oi', 'ola', 'olá', 'reset', 'inicio', 'bom dia'].includes(texto)) {
            userState[chatId] = { etapa: 'MENU' };
            
            await delay(500); // Pequena pausa natural
            
            await msg.reply(`Olá, ${nome}! 🤖\nSou o Assistente Técnico.\n\nEscolha uma opção:\n1. Consultar Erro OKI ES5112\n2. Falar com Atendente`);
            return;
        }

        // Se não tiver estado, define como MENU
        if (!userState[chatId]) userState[chatId] = { etapa: 'MENU' };

        // 3. FLUXO DO MENU
        if (userState[chatId].etapa === 'MENU') {
            if (texto === '1') {
                userState[chatId] = { etapa: 'BUSCA_OKI' };
                await delay(500);
                await msg.reply('📘 **Modo Manual OKI Ativado**\n\nDigite o código do erro ou peça (Ex: "980", "Fusor") que eu pesquiso para você.');
            } else if (texto === '2') {
                await msg.reply('Ok, aguarde um momento que um humano irá te responder.');
            } else {
                // Se digitar algo nada a ver, não faz nada ou repete o menu
            }
            return;
        }

        // 4. FLUXO DE BUSCA (AQUI ESTAVA O PROBLEMA)
        if (userState[chatId].etapa === 'BUSCA_OKI') {
            
            // Faz a busca no PDF
            // IMPORTANTE: Confira se o caminho do arquivo está correto na sua pasta
            const resultado = await buscarErroNoPDF('./manuais/oki_ES5112_manual.pdf', texto);
            
            await delay(1000);
            
            // Usamos reply para evitar o erro de "Visto"
            await msg.reply(resultado);
            
            await delay(1000);
            await client.sendMessage(msg.from, 'Pode digitar outro código ou digite "menu" para voltar.');
        }

    } catch (err) {
        console.error("Erro fatal na mensagem:", err);
    }
});