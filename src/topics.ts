import { Promiseable, isPromised } from 'botbuilder';

const toPromise = <T> (t: Promiseable<T>) => isPromised(t) ? t : Promise.resolve(t);

declare global {
    interface ConversationState {
        topical: {
            instances: {
                [instanceName: string]: TopicInstance;
            }
            rootInstanceName: string;
        },
    }
}

export class TopicInstance <State = any> {
    public name: string;
    public state = {} as State;

    constructor(
        public topicName: string,
        public callbackInstanceName?: string,
    ) {
        this.name = `instance of "${topicName}"(${Date.now().toString()}${Math.random().toString().substr(1)})`;
    }
}

export type TopicInit <
    InitArgs,
    State,
    CallbackArgs,
    T
> = (
    context: BotContext,
    topic: TopicInitHelper<InitArgs, State, CallbackArgs>,
) => T;

export enum TopicMethods {
    next,
    complete,
    dispatch,
}

export class TopicInitHelper <
    InitArgs,
    State,
    CallbackArgs,
> {
    constructor(
        private context: BotContext,
        public instance: TopicInstance<State>,
        public args: InitArgs,
        private data: TopicHelperData <CallbackArgs, TopicMethods>
    ) {
    }

    next () {
        if (this.data.lifecycle)
            throw "you may only call one of next(), dispatch(), or complete()";
        
        this.data.lifecycle = TopicMethods.next;
    }

    complete (
        args?: CallbackArgs,
    ) {
        if (this.data.lifecycle)
            throw "you may only call one of next(), dispatch(), or complete()";
        
        this.data.lifecycle = TopicMethods.complete;
        this.data.args = args;
    }

    dispatch () {
        if (this.data.lifecycle)
            throw "you may only call one of next(), dispatch(), or complete()";
        
        this.data.lifecycle = TopicMethods.dispatch;
    }
}

export type TopicNext <
    State,
    CallbackArgs,
    T
> = (
    context: BotContext,
    topic: TopicNextHelper<State, CallbackArgs>
) => T

export class TopicNextHelper <
    State,
    CallbackArgs,
> {
    constructor(
        private context: BotContext,
        public instance: TopicInstance<State>,
        private data: TopicHelperData<CallbackArgs, TopicMethods.next | TopicMethods.complete>,
    ) {
    }

    next () {
        if (this.data.lifecycle)
            throw "you may only call one of next() or complete()";
        
        this.data.lifecycle = TopicMethods.next;
    }

    complete (
        args?: CallbackArgs,
    ) {
        if (this.data.lifecycle)
            throw "you may only call one of next() or complete()";
        
        this.data.lifecycle = TopicMethods.complete;
        this.data.args = args;
    }
}

export interface TopicHelperData <CallbackArgs, AllowableTopicMethods> {
    lifecycle?: AllowableTopicMethods;
    args?: CallbackArgs;
}

export type TopicOnReceive <
    State,
    CallbackArgs,
    T
> = (
    context: BotContext,
    topic: TopicOnReceiveHelper<State, CallbackArgs>
) => T;

export class TopicOnReceiveHelper <
    State,
    CallbackArgs,
> {
    constructor(
        private context: BotContext,
        public instance: TopicInstance<State>,
        private data: TopicHelperData<CallbackArgs, TopicMethods.next | TopicMethods.complete>,
    ) {
    }

    next () {
        if (this.data.lifecycle)
            throw "you may only call one of next() or complete()";
        
        this.data.lifecycle = TopicMethods.next;
    }

    complete (
        args?: CallbackArgs,
    ) {
        if (this.data.lifecycle)
            throw "you may only call one of next() or complete()";
        
        this.data.lifecycle = TopicMethods.complete;
        this.data.args = args;
    }
}

export type TopicCallback <
    State,
    IncomingCallbackArgs,
    OutgoingCallbackArgs,
    T
> = (
    context: BotContext,
    topicCallbackHelper: TopicCallbackHelper<State, IncomingCallbackArgs, OutgoingCallbackArgs>,
) => T;

export class TopicCallbackHelper <
    State,
    IncomingCallbackArgs,
    OutgoingCallbackArgs,
> {
    constructor(
        public instance: TopicInstance<State>,
        public args: IncomingCallbackArgs,
        public child: string,
        private data: TopicHelperData<OutgoingCallbackArgs, TopicMethods.next | TopicMethods.complete>,
    ) {
    }

    next () {
        if (this.data.lifecycle)
            throw "you may only call one of next() or complete()";
        
        this.data.lifecycle = TopicMethods.next;
    }

    complete (
        args?: OutgoingCallbackArgs,
    ) {
        if (this.data.lifecycle)
            throw "you may only call one of next() or complete()";
        
        this.data.lifecycle = TopicMethods.complete;
        this.data.args = args;
    }
}

const returnsPromiseVoid = () => Promise.resolve();

export class Topic <
    InitArgs extends {} = {},
    State extends {} = {},
    CallbackArgs extends {} = {},
> {
    private static topics: {
        [name: string]: Topic;
    } = {}

    protected _init: TopicInit<InitArgs, State, CallbackArgs, Promise<void>> = returnsPromiseVoid;
    protected _next: TopicNext<State, CallbackArgs, Promise<void>> = returnsPromiseVoid;
    protected _onReceive: TopicOnReceive<State, CallbackArgs, Promise<void>> = returnsPromiseVoid;

    constructor (
        public name: string
    ) {
        if (Topic.topics[name]) {
            throw new Error(`An attempt was made to create a topic with existing name "${name}". Ignored.`);
        }
        
        Topic.topics[name] = this;
    }

    createInstance (
        context: BotContext,
        callbackInstanceName?: string,
        args?: InitArgs,
    ): Promise<string>;

    createInstance (
        context: BotContext,
        args?: InitArgs,
    ): Promise<string>;
    
    async createInstance (
        context: BotContext,
        ... params,
    ) {
        let args = {} as InitArgs;
        let callbackInstanceName: string;
        
        if (params.length > 0) {
            if (typeof params[0] === 'string') {
                callbackInstanceName = params[0];
                if (params.length > 1) {
                    args = params[1];
                }
            } else {
                args = params[0];
            }
        }
     
        const instance = new TopicInstance<State>(this.name, callbackInstanceName);

        context.state.conversation.topical.instances[instance.name] = instance;

        const data = {} as TopicHelperData<CallbackArgs, TopicMethods>;
        
        await toPromise(this._init(context, new TopicInitHelper(context, instance, args, data)));

        if (data.lifecycle === TopicMethods.complete) {
            await Topic.complete(context, instance, data.args);

            return undefined;
        } else {
            if (data.lifecycle === TopicMethods.next) {
                await Topic.next(context, instance.name);
            } else if (data.lifecycle === TopicMethods.dispatch) {
                await Topic.dispatch(context, instance.name);
            }

            return instance.name;
        }
    }

    static async do (
        context: BotContext,
        getRootInstanceName: () => Promise<string>
    ) {
        if (context.state.conversation.topical)
            return Topic.dispatch(context, context.state.conversation.topical.rootInstanceName);
        
        context.state.conversation.topical = {
            instances: {},
            rootInstanceName: undefined
        }

        context.state.conversation.topical.rootInstanceName = await getRootInstanceName();
    }

    static async next (
        context: BotContext,
        instanceName: string,
    ) {
        const instance = context.state.conversation.topical.instances[instanceName];

        if (!instance) {
            console.warn(`Unknown instance ${instanceName}`);
            return;
        }

        const topic = Topic.topics[instance.topicName];
        
        if (!topic) {
            console.warn(`Unknown topic ${instance.topicName}`);
            return;
        }

        const data = {} as TopicHelperData<any, TopicMethods.next | TopicMethods.complete>;

        await topic._next(context, new TopicNextHelper(context, instance, data));

        if (data.lifecycle === TopicMethods.next) {
            await Topic.next(context, instanceName);
        } else if (data.lifecycle === TopicMethods.complete) {
            await Topic.complete(context, instance, data.args);
        }
    }

    static async dispatch (
        context: BotContext,
        instanceName: string,
    ): Promise<void> {
        const instance = context.state.conversation.topical.instances[instanceName];

        if (!instance) {
            console.warn(`Unknown instance ${instanceName}`);
            return;
        }

        const topic = Topic.topics[instance.topicName];
        
        if (!topic) {
            console.warn(`Unknown topic ${instance.topicName}`);
            return;
        }

        const data = {} as TopicHelperData<any, TopicMethods.next | TopicMethods.complete>;

        await topic._onReceive(context, new TopicOnReceiveHelper(context, instance, data));

        if (data.lifecycle === TopicMethods.next) {
            await Topic.next(context, instanceName);
        } else if (data.lifecycle === TopicMethods.complete) {
            await Topic.complete(context, instance, data.args);
        }
    }

    static async complete <CallbackArgs = any> (
        context: BotContext,
        instance: TopicInstance<any>,
        args: CallbackArgs,
    ) {
        if (!instance.callbackInstanceName) {
            return;
        }
                
        const parentInstance = context.state.conversation.topical.instances[instance.callbackInstanceName];

        if (!parentInstance) {
            console.warn(`Unknown parent instance ${instance.callbackInstanceName}`);
            return;
        }

        const topic = Topic.topics[parentInstance.topicName];

        if (!topic) {
            console.warn(`Unknown topic ${parentInstance.topicName}`);
            return;
        }

        const data = {} as TopicHelperData<any, TopicMethods.next | TopicMethods.complete>;
    
        const topicCallbackHelper = new TopicCallbackHelper(parentInstance, args, instance.name, data);

        delete context.state.conversation.topical.instances[instance.name];

        await topic._callbacks[instance.topicName](context, topicCallbackHelper);

        if (data.lifecycle === TopicMethods.next) {
            await Topic.next(context, parentInstance.name);
        } else if (data.lifecycle === TopicMethods.complete) {
            await Topic.complete(context, parentInstance, data.args);
        }
    }

    init (
        init: TopicInit<InitArgs, State, CallbackArgs, Promiseable<void>>,
    ): this {
        this._init = (context, topic) => toPromise(init(context, topic));
    
        return this;
    }

    next (
        next: TopicNext<State, CallbackArgs, Promiseable<void>>,
    ): this {
        this._next = (context, topic) => toPromise(next(context, topic));

        return this;
    }

    onReceive (
        onReceive: TopicOnReceive<State, CallbackArgs, Promiseable<void>>,
    ): this {
        this._onReceive = (context, instance) => toPromise(onReceive(context, instance));

        return this;
    }

    private _callbacks: {
        [topicName: string]: TopicCallback<any, any, any, Promise<void>>;
    } = {}

    onComplete <C> (
        topic: Topic<any, any, C>,
        callback: TopicCallback<State, C, CallbackArgs, Promiseable<void>>,
    ): this {
        if (this._callbacks[topic.name])
            throw new Error(`An attempt was made to create a callback with existing topic named ${topic.name}. Ignored.`);

        this._callbacks[topic.name] = (context, topic) => toPromise(callback(context, topic));

        return this;
    }
}
