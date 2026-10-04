import '@procot/webostv/webOSTV';

export default class FileServiceAdapter implements FileServiceInterface {
    writeEpgCache(data: unknown): Promise<WebOSTV.OnCompleteSuccessResponse> {
        return new Promise<WebOSTV.OnCompleteSuccessResponse>((resolve, reject) => {
            console.log('lsa: write epg cache');
            global.webOS.service.request('luna://com.willinux.tvh.app.proxy', {
                method: 'fileIO',
                parameters: { filename: 'epgcache.json', write: true, data: data },
                onSuccess: (res: WebOSTV.OnCompleteSuccessResponse) => resolve(res),
                onFailure: (res: ProxyErrorResponse) => reject(res),
                onComplete: () => {
                    console.log('lsa: write epg cache end');
                }
            });
        });
    }

    readEpgCache<T>(): Promise<EpgSuccessResponse<T>> {
        return new Promise<EpgSuccessResponse<T>>((resolve, reject) => {
            console.log('lsa: read epg cache');
            global.webOS.service.request('luna://com.willinux.tvh.app.proxy', {
                method: 'fileIO',
                parameters: { filename: 'epgcache.json', read: true },
                onSuccess: (res: EpgSuccessResponse<T>) => resolve(res),
                onFailure: (res: ProxyErrorResponse) => reject(res),
                onComplete: () => {
                    console.log('lsa: read epg cache end');
                }
            });
        });
    }

    writeSettingsBackup(data: { [key: string]: string }): Promise<SettingsBackupWriteResponse> {
        return this.requestSettingsBackup<SettingsBackupWriteResponse>({ write: true, data: data });
    }

    readSettingsBackup(): Promise<SettingsBackupReadResponse> {
        return this.requestSettingsBackup<SettingsBackupReadResponse>({ read: true });
    }

    private requestSettingsBackup<T extends WebOSTV.OnCompleteSuccessResponse>(
        parameters: Record<string, unknown>
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            // the service might not answer at all (e.g. an older service version)
            const timeout = setTimeout(() => reject({ errorText: 'settings backup did not answer' }), 10000);
            global.webOS.service.request('luna://com.willinux.tvh.app.proxy', {
                method: 'settingsBackup',
                parameters: parameters,
                onSuccess: (res: WebOSTV.OnCompleteSuccessResponse) => {
                    clearTimeout(timeout);
                    resolve(res as T);
                },
                onFailure: (res: ProxyErrorResponse) => {
                    clearTimeout(timeout);
                    reject(res);
                }
            });
        });
    }
}
