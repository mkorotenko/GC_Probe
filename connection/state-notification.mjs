import EventEmitter from "events";

export class StateNotificator extends EventEmitter {
  constructor(modules) {
    super();
    this.modules = modules;
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
        // connectionManager.send({ [data.message]: { [request.function]: result } });
        // return { [data.message]: { [request.function]: result } };
    } catch (error) {
        // console.error(`Failed to process request:`, error);
        const erroStr = stringifyError(error);
        // connectionManager.send({ 'Response': `Failed to process ${data.message} request: ${erroStr}` });
        return { 'error': `Failed to process request: ${erroStr}` };
    }
  }

  async requestHandler(data) {
    if (!data?.message) {
        this.emit({'error': 'Invalid request', request: data});
        return;
    }

    this.emit('data', { 'Response': `State notification module: ${data.message}` });
    const module = this.modules[data.message];
    if (!module) {
        this.emit({'error': 'Invalid module', 'request': data.message});
        return;
    }
    const request = data.request;
    this.emit('data', { 'Request': request });
    if (Array.isArray(request)) {
        const results = [];
        for (const reqItem of request) {
            // try {
            //     const result = await comModuleHandler(module, reqItem);
            //     results.push({ [reqItem.function]: result });
            //     // connectionManager.send({ 'comModule': { [reqItem.function]: result } });
            // } catch (error) {
            //     console.error(`Failed to process ${data.message} request:`, error);
            //     const erroStr = stringifyError(error);
            //     results.push({ [reqItem.function]: `Failed to process ${data.message} request: ${erroStr}` });
            //     // connectionManager.send({ 'Response': `Failed to process comModule request: ${erroStr}` });
            // }
            const result = await this.moduleHandler(reqItem, module);
            results.push({ [reqItem.function]: result });
        }
        // connectionManager.send({ [data.message]: results });
        this.emit('data', {[data.message]: results});
    } else {
        // try {
        //     const result = await comModuleHandler(module, reqData);
        //     connectionManager.send({ [data.message]: { [reqData.function]: result } });
        // } catch (error) {
        //     console.error(`Failed to process ${data.message} request:`, error);
        //     const erroStr = stringifyError(error);
        //     connectionManager.send({ 'Response': `Failed to process ${data.message} request: ${erroStr}` });
        // }
        const result = await this.moduleHandler(request, module);
        this.emit('data', {[data.message]: {[request.function]: result}});
    }
  }
}
