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
        public parentInstanceName?: string,
    ) {
        this.name = `instance of "${topicName}"(${Date.now().toString()}${Math.random().toString().substr(1)})`;
    }
}

export type TopicInit <
    InitArgs,
    State,
    CompleteArgs,
    T
> = (
    context: BotContext,
    topic: TopicInitHelper<InitArgs, State, CompleteArgs>,
) => T;

export enum TopicMethods {
    next,
    complete,
    dispatch,
}

export class TopicInitHelper <
    InitArgs,
    State,
    CompleteArgs,
> {
    constructor(
        private context: BotContext,
        public instance: TopicInstance<State>,
        public args: InitArgs,
        private data: TopicHelperData <CompleteArgs, TopicMethods>
    ) {
    }

    next () {
        if (this.data.lifecycle)
            throw "you may only call one of next(), dispatch(), or complete()";
        
        this.data.lifecycle = TopicMethods.next;
    }

    complete (
        args?: CompleteArgs,
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
    CompleteArgs,
    T
> = (
    context: BotContext,
    topic: TopicNextHelper<State, CompleteArgs>
) => T

export class TopicNextHelper <
    State,
    CompleteArgs,
> {
    constructor(
        private context: BotContext,
        public instance: TopicInstance<State>,
        private data: TopicHelperData<CompleteArgs, TopicMethods.next | TopicMethods.complete>,
    ) {
    }

    next () {
        if (this.data.lifecycle)
            throw "you may only call one of next() or complete()";
        
        this.data.lifecycle = TopicMethods.next;
    }

    complete (
        args?: CompleteArgs,
    ) {
        if (this.data.lifecycle)
            throw "you may only call one of next() or complete()";
        
        this.data.lifecycle = TopicMethods.complete;
        this.data.args = args;
    }
}

export interface TopicHelperData <CompleteArgs, AllowableTopicMethods> {
    lifecycle?: AllowableTopicMethods;
    args?: CompleteArgs;
}

export type TopicOnReceive <
    State,
    CompleteArgs,
    T
> = (
    context: BotContext,
    topic: TopicOnReceiveHelper<State, CompleteArgs>
) => T;

export class TopicOnReceiveHelper <
    State,
    CompleteArgs,
> {
    constructor(
        private context: BotContext,
        public instance: TopicInstance<State>,
        private data: TopicHelperData<CompleteArgs, TopicMethods.next | TopicMethods.complete>,
    ) {
    }

    next () {
        if (this.data.lifecycle)
            throw "you may only call one of next() or complete()";
        
        this.data.lifecycle = TopicMethods.next;
    }

    complete (
        args?: CompleteArgs,
    ) {
        if (this.data.lifecycle)
            throw "you may only call one of next() or complete()";
        
        this.data.lifecycle = TopicMethods.complete;
        this.data.args = args;
    }
}

export type TopicComplete <
    State,
    IncomingCompleteArgs,
    OutgoingCompleteArgs,
    T
> = (
    context: BotContext,
    topicCompleteHelper: TopicCompleteHelper<State, IncomingCompleteArgs, OutgoingCompleteArgs>,
) => T;

export class TopicCompleteHelper <
    State,
    IncomingCompleteArgs,
    OutgoingCompleteArgs,
> {
    constructor(
        public instance: TopicInstance<State>,
        public args: IncomingCompleteArgs,
        public child: string,
        private data: TopicHelperData<OutgoingCompleteArgs, TopicMethods.next | TopicMethods.complete>,
    ) {
    }

    next () {
        if (this.data.lifecycle)
            throw "you may only call one of next() or complete()";
        
        this.data.lifecycle = TopicMethods.next;
    }

    complete (
        args?: OutgoingCompleteArgs,
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
    CompleteArgs extends {} = {},
> {
    private static topics: {
        [name: string]: Topic;
    } = {}

    protected _init: TopicInit<InitArgs, State, CompleteArgs, Promise<void>> = returnsPromiseVoid;
    protected _next: TopicNext<State, CompleteArgs, Promise<void>> = returnsPromiseVoid;
    protected _onReceive: TopicOnReceive<State, CompleteArgs, Promise<void>> = returnsPromiseVoid;

    constructor (
        public name: string
    ) {
        if (Topic.topics[name]) {
            throw new Error(`An attempt was made to create a topic with existing name "${name}".`);
        }
        
        Topic.topics[name] = this;
    }

    createInstance (
        context: BotContext,
        parentInstanceName?: string,
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
        let parentInstanceName: string;
        
        if (params.length > 0) {
            if (typeof params[0] === 'string') {
                parentInstanceName = params[0];
                if (params.length > 1) {
                    args = params[1];
                }
            } else {
                args = params[0];
            }
        }
     
        const instance = new TopicInstance<State>(this.name, parentInstanceName);

        context.state.conversation.topical.instances[instance.name] = instance;

        const data = {} as TopicHelperData<CompleteArgs, TopicMethods>;
        
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

    static async complete <CompleteArgs = any> (
        context: BotContext,
        instance: TopicInstance<any>,
        args: CompleteArgs,
    ) {
        if (!instance.parentInstanceName) {
            return;
        }
                
        const parentInstance = context.state.conversation.topical.instances[instance.parentInstanceName];

        if (!parentInstance) {
            console.warn(`Unknown parent instance ${instance.parentInstanceName}`);
            return;
        }

        const topic = Topic.topics[parentInstance.topicName];

        if (!topic) {
            console.warn(`Unknown topic ${parentInstance.topicName}`);
            return;
        }

        const data = {} as TopicHelperData<any, TopicMethods.next | TopicMethods.complete>;
    
        const topicCompleteHelper = new TopicCompleteHelper(parentInstance, args, instance.name, data);

        delete context.state.conversation.topical.instances[instance.name];

        await topic._completeHandlers[instance.topicName](context, topicCompleteHelper);

        if (data.lifecycle === TopicMethods.next) {
            await Topic.next(context, parentInstance.name);
        } else if (data.lifecycle === TopicMethods.complete) {
            await Topic.complete(context, parentInstance, data.args);
        }
    }

    init (
        init: TopicInit<InitArgs, State, CompleteArgs, Promiseable<void>>,
    ): this {
        this._init = (context, topic) => toPromise(init(context, topic));
    
        return this;
    }

    next (
        next: TopicNext<State, CompleteArgs, Promiseable<void>>,
    ): this {
        this._next = (context, topic) => toPromise(next(context, topic));

        return this;
    }

    onReceive (
        onReceive: TopicOnReceive<State, CompleteArgs, Promiseable<void>>,
    ): this {
        this._onReceive = (context, instance) => toPromise(onReceive(context, instance));

        return this;
    }

    private _completeHandlers: {
        [topicName: string]: TopicComplete<any, any, any, Promise<void>>;
    } = {}

    onComplete <C> (
        topic: Topic<any, any, C>,
        completeHandler: TopicComplete<State, C, CompleteArgs, Promiseable<void>>,
    ): this {
        if (this._completeHandlers[topic.name])
            throw new Error(`An attempt was made to call onComplete for topic ${topic.name}. This topic is already handled.`);

        this._completeHandlers[topic.name] = (context, topic) => toPromise(completeHandler(context, topic));

        return this;
    }
}
