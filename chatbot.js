const qrcode = require('qrcode-terminal');
const { Client } = require('whatsapp-web.js');
const fs = require('fs');
const pdf = require('pdf-parse');

const client = new Client();

// --- 1. CONFIGURAÇÃO DOS MANUAIS ---
// Aqui você diz onde está o PDF de cada impressora
const bancoDeManuais = {
    'canon': {
        'ir1643': './manuais/canon_ir1643_manual.pdf',
        'adv_dx': './manuais/canon_adv_dx_manual.pdf'
    },
    'oki': {
        'b432': './manuais/oki_b432_manual.pdf',
        'c711': './manuais/oki_c711_manual.pdf'
    }
};

// --- 2. CONTROLE DE ESTADO DO USUÁRIO ---
// Isso serve para o bot saber em qual etapa o usuário está
// Ex: { '551199999999@c.us': { etapa: 'ESCOLHER_MARCA', marca: 'canon' } }
const userState = {};

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Técnico Virtual Online!');
});

client.initialize();

client.on('message', async msg => {
    if (!msg.from.endsWith('@c.us')) return; // Apenas conversas privadas

    const chatId = msg.from;
    const texto = msg.body.toLowerCase().trim();

    // Se o usuário mandar "reset", "menu" ou "oi", zeramos o estado dele
    if (['menu', 'oi', 'ola', 'olá', 'reset', 'inicio'].includes(texto)) {
        userState[chatId] = { etapa: 'ESCOLHER_MARCA' };
        await client.sendMessage(chatId, `🔧 *Assistente Técnico de Impressoras*\n\nSelecione a marca do equipamento:\n\n1 - Canon\n2 - OKI`);
        return;
    }

    // Se o usuário não tem estado definido, define como inicial
    if (!userState[chatId]) {
        userState[chatId] = { etapa: 'ESCOLHER_MARCA' };
    }

    const estadoAtual = userState[chatId];

    // --- LÓGICA DAS ETAPAS ---

    // ETAPA 1: Usuário escolhe a marca
    if (estadoAtual.etapa === 'ESCOLHER_MARCA') {
        if (texto === '1' || texto === 'canon') {
            estadoAtual.marca = 'canon';
            estadoAtual.etapa = 'ESCOLHER_MODELO';
            await client.sendMessage(chatId, `Você escolheu *Canon*. Qual o modelo?\n\nDigite o nome exato ou opção:\n1 - ir1643\n2 - adv_dx`);
        } else if (texto === '2' || texto === 'oki') {
            estadoAtual.marca = 'oki';
            estadoAtual.etapa = 'ESCOLHER_MODELO';
            await client.sendMessage(chatId, `Você escolheu *OKI*. Qual o modelo?\n\nDigite o nome exato ou opção:\n1 - b432\n2 - c711`);
        } else {
            await client.sendMessage(chatId, 'Opção inválida. Digite 1 para Canon ou 2 para OKI.');
        }
    }

    // ETAPA 2: Usuário escolhe o modelo
    else if (estadoAtual.etapa === 'ESCOLHER_MODELO') {
        // Mapeamento simples para facilitar a digitação
        const opcoesModelo = {
            'canon': { '1': 'ir1643', '2': 'adv_dx' },
            'oki':   { '1': 'b432', '2': 'c711' }
        };

        // Verifica se digitou o número (1, 2) ou o nome do modelo direto
        let modeloEscolhido = opcoesModelo[estadoAtual.marca][texto] || texto;

        // Verifica se esse modelo existe no nosso banco de manuais
        if (bancoDeManuais[estadoAtual.marca][modeloEscolhido]) {
            estadoAtual.modelo = modeloEscolhido;
            estadoAtual.etapa = 'BUSCAR_ERRO'; // Avança para a próxima etapa
            await client.sendMessage(chatId, `Modelo *${modeloEscolhido.toUpperCase()}* selecionado.\n\nAgora, digite o *CÓDIGO DE ERRO* ou a mensagem que aparece no visor (ex: E000, Paper Jam).`);
        } else {
            await client.sendMessage(chatId, `Modelo não encontrado ou inválido. Tente digitar 1 ou 2, ou o nome do modelo.`);
        }
    }

    // ETAPA 3: Busca no PDF
    else if (estadoAtual.etapa === 'BUSCAR_ERRO') {
        await client.sendMessage(chatId, '🔍 Buscando no manual técnico, aguarde um momento...');
        
        const caminhoPDF = bancoDeManuais[estadoAtual.marca][estadoAtual.modelo];
        
        try {
            const resposta = await buscarErroNoPDF(caminhoPDF, texto); // Função que cria a mágica
            await client.sendMessage(chatId, resposta);
            await client.sendMessage(chatId, '\n---\nDigite outro código de erro para pesquisar novamente ou *Menu* para voltar.');
        } catch (erro) {
            console.error(erro);
            await client.sendMessage(chatId, 'Erro ao ler o manual. Tente novamente mais tarde.');
        }
    }
});

// --- FUNÇÃO DE LEITURA DO PDF ---
async function buscarErroNoPDF(caminhoArquivo, termoBusca) {
    try {
        // Lê o arquivo do disco
        const dataBuffer = fs.readFileSync(caminhoArquivo);
        
        // Extrai o texto usando pdf-parse
        const data = await pdf(dataBuffer);
        const textoCompleto = data.text; // Todo o texto do manual

        // Lógica simples de busca:
        // Procura onde o termo aparece
        const index = textoCompleto.toLowerCase().indexOf(termoBusca.toLowerCase());

        if (index !== -1) {
            // Se achou, pega 300 caracteres antes e 600 depois para dar contexto
            const inicio = Math.max(0, index - 100);
            const fim = Math.min(textoCompleto.length, index + 600);
            
            let trechoEncontrado = textoCompleto.substring(inicio, fim);
            
            // Limpeza básica de quebras de linha excessivas
            trechoEncontrado = trechoEncontrado.replace(/\n\s*\n/g, '\n');

            return `✅ *Encontrado no Manual:*\n\n"...${trechoEncontrado}..."\n\n(Pode conter falhas de formatação devido à leitura automática)`;
        } else {
            return `❌ O erro "${termoBusca}" não foi encontrado neste manual. Verifique se digitou corretamente (ex: E000-0000).`;
        }

    } catch (e) {
        return "Erro ao abrir o arquivo do manual. Verifique se o PDF existe.";
    }
}