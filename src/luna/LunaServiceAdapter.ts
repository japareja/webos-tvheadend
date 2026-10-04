import '@procot/webostv/webOSTV';

// system services that don't answer must not block the app start
const SYSTEM_CALL_TIMEOUT_MILLIS = 10000;

const withTimeout = <T>(promise: Promise<T>, name: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => reject({ errorText: name + ' did not answer' }), SYSTEM_CALL_TIMEOUT_MILLIS);
        promise.then(
            (result) => {
                clearTimeout(timeout);
                resolve(result);
            },
            (error) => {
                clearTimeout(timeout);
                reject(error);
            }
        );
    });

/**
 * Depending on local development or emulator usage
 * the service bridge is differen
 * - local js => java object reference
 * - local + webos emulator => luna service bus
 */
export default class LunaServiceAdapter implements LunaServiceInterface {
    isAvailable(): boolean {
        const isAvailable = global.webOS && global.webOS.service ? true : false;
        return isAvailable;
    }

    toast(message: string): void {
        console.log('lsa:toast start');
        global.webOS.service.request('luna://com.webos.notification', {
            method: 'createToast',
            parameters: {
                message: message
            },
            onSuccess: () => {
                console.log('succesfully created toast');
            },
            onFailure: () => {
                console.log('failed to create toast');
            },
            onComplete: () => {
                console.log('lsa:toast end');
            }
        });
    }

    getLocaleInfo(): Promise<LocaleInfoSuccessResponse> {
        return withTimeout(this.requestLocaleInfo(), 'settingsservice');
    }

    private requestLocaleInfo(): Promise<LocaleInfoSuccessResponse> {
        return new Promise<LocaleInfoSuccessResponse>(function (resolve, reject) {
            global.webOS.service.request('luna://com.webos.settingsservice', {
                method: 'getSystemSettings',
                parameters: {
                    keys: ['localeInfo']
                },
                onSuccess: (res: LocaleInfoSuccessResponse) => resolve(res),
                onFailure: (res) => reject(res)
            });
        });
    }

    getDeviceInfo(): Promise<DeviceInfoSuccessResponse> {
        return withTimeout(this.requestDeviceInfo(), 'systemproperty');
    }

    private requestDeviceInfo(): Promise<DeviceInfoSuccessResponse> {
        return new Promise<DeviceInfoSuccessResponse>(function (resolve, reject) {
            global.webOS.service.request('luna://com.webos.service.tv.systemproperty', {
                method: 'getSystemInfo',
                parameters: {
                    keys: ['modelName', 'firmwareVersion', 'sdkVersion']
                },
                onSuccess: (res: DeviceInfoSuccessResponse) => resolve(res),
                onFailure: (res) => reject(res)
            });
        });
    }

    getNetworkInfo(): Promise<ConnectionMgrResponse> {
        return withTimeout(this.requestNetworkInfo(), 'connectionmanager');
    }

    private requestNetworkInfo(): Promise<ConnectionMgrResponse> {
        return new Promise<ConnectionMgrResponse>(function (resolve, reject) {
            global.webOS.service.request('luna://com.palm.connectionmanager', {
                method: 'getStatus',
                onSuccess: (inResponse: ConnectionMgrResponse) => resolve(inResponse),
                onFailure: (inError) => reject(inError)
            });
        });
    }
}
