/**
 * Função Serverless para Vercel (Node.js)
 * * Esta função recebe um ID via query string (e.g., /api/get-mp4-link?id=1234)
 * e faz uma requisição para o player externo para extrair o link do arquivo MP4.
 *
 * NOTA CRÍTICA: O nome do arquivo deve ser `api/get-mp4-link.js` para que
 * a rota no Vercel seja `https://movieflix.vercel.app/api/get-mp4-link?id=...`
 * ou renomeie para `api/index.js` para usar a rota que você mencionou: `https://movieflix.vercel.app/api/?id=...`
 * * Eu usarei `module.exports` conforme o padrão de funções Vercel/Netlify.
 */

// Importa a função nativa fetch do Node.js
const fetch = require('node-fetch');

// Expressão regular robusta para encontrar URLs MP4 (geralmente dentro de strings de players)
// Busca por qualquer string que comece com http(s) e termine em .mp4
const MP4_REGEX = /(https?:\/\/[^\s"'<>]+\.mp4)/i;

// Função de utilidade para implementar Exponential Backoff em caso de falhas temporárias
// Isso é crucial para lidar com problemas de rede ou limites de taxa (rate limiting)
const backoffFetch = async (url, options = {}, retries = 3) => {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) {
                return response;
            }
            // Lança erro para ser pego pelo catch e tentar novamente, se for um erro recuperável (429, 503, etc.)
            lastError = new Error(`Request failed with status ${response.status}`);
        } catch (error) {
            lastError = error;
        }

        if (i < retries - 1) {
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000; // 2s, 4s, 8s + jitter
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError; // Lança o último erro após todas as tentativas falharem
};


module.exports = async (req, res) => {
    // 1. Configurações de CORS para permitir acesso do seu frontend
    res.setHeader('Access-Control-Allow-Origin', '*'); // Permite qualquer origem. Ajuste para seu domínio se preferir.
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Responde a requisições OPTIONS (pré-voo CORS)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Pega o ID da query string
    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ 
            success: false, 
            message: "ID do filme/episódio não fornecido. Use a rota /api/?id=SEU_ID" 
        });
    }

    const playerUrl = `https://playerscdn.xyz/e/${id}`;

    try {
        // 2. Faz a requisição para a URL do player
        const response = await backoffFetch(playerUrl);
        const htmlContent = await response.text();

        // 3. Extrai o link MP4 usando Regex
        const match = htmlContent.match(MP4_REGEX);

        if (match && match[1]) {
            const mp4Link = match[1];

            // 4. Retorna o link MP4 com sucesso
            return res.status(200).json({ 
                success: true, 
                id: id,
                mp4Link: mp4Link 
            });
        } else {
            // Se o regex não encontrar o link
            return res.status(404).json({ 
                success: false, 
                message: "Link MP4 não encontrado no player. O HTML do player pode ter mudado." 
            });
        }

    } catch (error) {
        console.error("Erro na busca do player:", error.message);
        return res.status(500).json({ 
            success: false, 
            message: `Erro interno do servidor ao processar a requisição para o ID ${id}.`,
            details: error.message 
        });
    }
};