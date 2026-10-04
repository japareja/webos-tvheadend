import '@procot/webostv/webOSTV';

// a request to the proxy service must never hang forever (e.g. if the service doesn't answer)
const CALL_TIMEOUT_MILLIS = 30000;
// the proxy service needs some time to start, especially after switching on the tv
const MAX_AVAILABILITY_CHECKS = 30;

export default class HttpProxyServiceAdapter implements HttpProxyInterface {
    call<T>(params: ProxyRequestParams): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            console.log('lsa:%s start', params.url);
            const timeout = setTimeout(
                () => reject({ returnValue: false, errorText: 'The proxy service did not answer' }),
                CALL_TIMEOUT_MILLIS
            );
            global.webOS.service.request('luna://com.willinux.tvh.app.proxy', {
                method: 'proxy',
                parameters: params,
                onSuccess: (res: ProxySuccessResponse<string>) => {
                    clearTimeout(timeout);
                    try {
                        resolve(JSON.parse(res.result) as T);
                    } catch {
                        resolve((res.result as unknown) as T);
                    }
                },
                onFailure: (res: ProxyErrorResponse) => {
                    clearTimeout(timeout);
                    reject(res);
                },
                onComplete: () => {
                    console.log('lsa:%s end', params.url);
                }
            });
        });
    }

    /**
     * wait until the proxy service answers, checked every 2s for up to a minute
     */
    isAvailable(check = 1): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            const retry = (reason: unknown) => {
                if (check >= MAX_AVAILABILITY_CHECKS) {
                    reject('HttpProxyService did not start: ' + JSON.stringify(reason));
                    return;
                }
                setTimeout(() => {
                    this.isAvailable(check + 1)
                        .then(resolve)
                        .catch(reject);
                }, 2000);
            };
            global.webOS.service.request('luna://com.willinux.tvh.app.proxy', {
                method: 'ping',
                parameters: {},
                onSuccess: function (res) {
                    if (res.returnValue) {
                        console.log('http proxy is available!');
                        resolve(true);
                    } else {
                        console.log('http proxy not available yet, retrying...');
                        retry(res);
                    }
                },
                onFailure: function (err) {
                    console.error('Error checking service, retrying...:', err);
                    retry(err);
                }
            });
        });
    }
}
