import EventEmitter from "events";

export class StateNotificator extends EventEmitter {
    constructor(modules) {
        super();
        this.modules = modules;
    }

    stringifyError(error) {
        return JSON.stringify(error, Object.getOwnPropertyNames(error));
    }

    async requestModuleHandler(cModule, request) {
        const fn = request.function;
        const params = request.options || [];
        if (!cModule[fn]) {
            throw new Error(`Function "${fn}" not found.`);
        }
        return await cModule[fn](...params);
    }

    async moduleHandler(request, module) {
        try {
            return await this.requestModuleHandler(module, request);
        } catch (error) {
            const erroStr = this.stringifyError(error);
            return { 'error': `Failed to process request: ${erroStr}` };
        }
    }

    async requestHandler(data) {
        if (!data?.message) {
            this.emit({ 'error': 'Invalid request', request: data });
            return;
        }

        const module = this.modules[data.message];
        if (!module) {
            this.emit({ 'error': 'Invalid module', 'request': data.message });
            return;
        }
        const request = data.request;
        if (Array.isArray(request)) {
            const results = [];
            for (const reqItem of request) {
                const result = await this.moduleHandler(reqItem, module);
                results.push({ [reqItem.function]: result });
            }

            this.emit('data', { [data.message]: results });
        } else {
            const result = await this.moduleHandler(request, module);

            this.emit('data', { [data.message]: { [request.function]: result } });
        }
    }
}
