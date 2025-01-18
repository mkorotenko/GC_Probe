import EventEmitter from "events";

const INTERVAL_ID = {
    id: 1000
}
class IntervalHandler {
    constructor(notificator, request, interval) {
        this.notificator = notificator;
        this.id = INTERVAL_ID.id++;

        this.request = { 
            message: request.message,
            request: request.request,
            intervalId: this.id 
        };
        this.interval = interval;
        this.taskPending = false;
        this.start();
    }

    // addRequest(request, interval) {
    //     this.intervals.push(interval);
    // }

    async start() {
        if (this.taskPending) {
            console.error('Task is already pending.');
            return;
        }

        if (this.timerID) {
            clearInterval(this.timerID);
        }
        this.taskPending = true;
        await this.notificator.requestHandler(this.request);
        this.timerID = setInterval(async () => {
            if (this.taskPending) {
                console.error('Task is already pending.');
                return;
            }
            this.taskPending = true;
            await this.notificator.requestHandler(this.request);
            this.taskPending = false;
        }, this.interval);
        this.taskPending = false;
    }

    stop() {
        if (this.timerID) {
            clearInterval(this.timerID);
        }
        this.timerID = null;
    }
}

export class StateNotificator extends EventEmitter {

    tasks = [];

    constructor(modules) {
        super();
        this.modules = modules;
    }

    stringifyError(error) {
        return JSON.stringify(error, Object.getOwnPropertyNames(error));
    }

    // Both tasks not contain the same request
    compareRequests(request1, request2) {
        if (request1.message !== request2.message) {
            return false;
        }
        if (request1.request.function !== request2.request.function) {
            return false;
        }
        if (Array.isArray(request1.request.function) && Array.isArray(request2.request.function)) {
            let a1 = request1.request.function, a2 = request2.request.function;
            if (a2.length > a1.length) {
                a1 = request2.request.function;
                a2 = request1.request.function;
            }
            return a1.some((item) => {
                if (!a2.includes(item)) {
                    return true;
                }
            });
        }
        return true;
    }

    addTask(data) {
        if (this.tasks.some(this.compareRequests.bind(this, data))) {
            console.error('Task already contains same functions.');
            return false;
        }
        const task = new IntervalHandler(this, data, data.setInterval);
        this.tasks.push(task);
        return true;
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

        if (data.setInterval) {
            // const task = new IntervalHandler(this, data, data.setInterval);
            // this.tasks.push(task);
            if (this.addTask(data)) {
                this.emit('data', { 'setInterval': 'Task added' });
                return;
            } else {
                this.emit('error', { 'setInterval': 'Failed to add task' });
            }
            // return;
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
