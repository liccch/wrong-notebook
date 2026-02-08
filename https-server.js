/**
 * HTTPS wrapper for Next.js standalone server - Debug Version
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CERT_DIR = process.env.CERT_DIR || '/app/certs';
const CERT_FILE = path.join(CERT_DIR, 'cert.pem');
const KEY_FILE = path.join(CERT_DIR, 'key.pem');
const PROXY_TIMEOUT = 300000;

if (!fs.existsSync(CERT_FILE) || !fs.existsSync(KEY_FILE)) {
    console.error('[HTTPS] 证书文件不存在:', CERT_DIR);
    process.exit(1);
}

const options = {
    key: fs.readFileSync(KEY_FILE),
    cert: fs.readFileSync(CERT_FILE),
};

const port = parseInt(process.env.PORT || '3000', 10);

console.log(`[HTTPS] 启动 HTTPS 代理，端口 443 -> HTTP ${port}`);

const httpsServer = https.createServer(options, (req, res) => {
    const startTime = Date.now();
    console.log(`[HTTPS] 请求开始: ${req.method} ${req.url}`);

    const proxyOptions = {
        hostname: '127.0.0.1',
        port: port,
        path: req.url,
        method: req.method,
        headers: req.headers,
        timeout: PROXY_TIMEOUT,
    };

    const proxyReq = http.request(proxyOptions, (proxyRes) => {
        console.log(`[HTTPS] 收到响应: ${proxyRes.statusCode} for ${req.method} ${req.url}`);
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);

        proxyRes.on('end', () => {
            console.log(`[HTTPS] 响应完成: ${req.method} ${req.url} (${Date.now() - startTime}ms)`);
        });
    });

    req.setTimeout(PROXY_TIMEOUT);
    res.setTimeout(PROXY_TIMEOUT);

    proxyReq.on('timeout', () => {
        console.error(`[HTTPS] 超时: ${req.method} ${req.url}`);
        proxyReq.destroy();
        if (!res.headersSent) {
            res.writeHead(504);
            res.end('Gateway Timeout');
        }
    });

    proxyReq.on('error', (err) => {
        console.error(`[HTTPS] 代理错误 for ${req.method} ${req.url}:`, err.message, err.code);
        if (!res.headersSent) {
            res.writeHead(502);
            res.end('Bad Gateway');
        }
    });

    req.on('error', (err) => {
        console.error(`[HTTPS] 客户端错误 for ${req.method} ${req.url}:`, err.message);
        proxyReq.destroy();
    });

    req.on('close', () => {
        console.log(`[HTTPS] 客户端关闭连接: ${req.method} ${req.url}`);
        // 不要在这里 destroy proxyReq，会导致正常请求被中断
        // proxyReq.destroy();
    });

    let bytesReceived = 0;

    req.on('data', (chunk) => {
        bytesReceived += chunk.length;
        console.log(`[HTTPS] 收到数据: ${chunk.length} bytes (total: ${bytesReceived})`);
        proxyReq.write(chunk);
    });

    req.on('end', () => {
        console.log(`[HTTPS] 请求体结束: ${req.method} ${req.url}, total ${bytesReceived} bytes`);
        proxyReq.end();
    });
});

httpsServer.timeout = PROXY_TIMEOUT;
httpsServer.keepAliveTimeout = 65000;
httpsServer.headersTimeout = 66000;

const httpsPort = parseInt(process.env.HTTPS_PORT || '443', 10);

httpsServer.listen(httpsPort, '0.0.0.0', () => {
    console.log(`[HTTPS] HTTPS 服务器已启动，监听端口 ${httpsPort}`);
});
