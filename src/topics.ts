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

export type TopicMethod <
    State,
    CompleteArgs,
    T
> = (
    context: BotContext,
    topic: TopicMethodHelper<State, CompleteArgs>,
) => T;

export interface TopicMethodHelperData <CompleteArgs> {
    topicMethod?: TopicMethods;
    args?: CompleteArgs;
}

export class TopicMethodHelper <State, CompleteArgs> {
    constructor(
        protected context: BotContext,
        public instance: TopicInstance<State>,
        protected data: TopicMethodHelperData <CompleteArgs>,
    ) {
    }

    createTopicInstance <_InitArgs> (
        topic: Topic<_InitArgs>,
        args?: _InitArgs,
    ) {
        return topic.createInstance(this.context, this.instance.name, args);
    }

    next () {
        if (this.data.topicMethod)
            throw "you may only call one of next(), onReceive(), or complete()";
        
        this.data.topicMethod = TopicMethods.next;
    }

    complete (
        args?: CompleteArgs,
    ) {
        if (this.data.topicMethod)
            throw "you may only call one of next(), onReceive(), or complete()";
        
        this.data.topicMethod = TopicMethods.complete;
        this.data.args = args;
    }

    onReceive () {
        if (this.data.topicMethod)
            throw "you may only call one of next(), onReceive(), or complete()";
        
        this.data.topicMethod = TopicMethods.dispatch;
    }

    dispatchToInstance (
        instanceName: string
    ) {
        return Topic.dispatch(this.context, instanceName);
    }
}

export class TopicInitHelper <
    InitArgs,
    State,
    CompleteArgs,
> extends TopicMethodHelper<State, CompleteArgs> {
    constructor(
        context: BotContext,
        instance: TopicInstance<State>,
        data: TopicMethodHelperData <CompleteArgs>,
        public args: InitArgs,
    ) {
        super(context, instance, data);
    }
}

export type TopicOnComplete <
    State,
    IncomingCompleteArgs,
    OutgoingCompleteArgs,
    T
> = (
    context: BotContext,
    topicOnCompleteHelper: TopicOnCompleteHelper<State, IncomingCompleteArgs, OutgoingCompleteArgs>,
) => T;

export class TopicOnCompleteHelper <
    State,
    IncomingCompleteArgs,
    OutgoingCompleteArgs,
> extends TopicInitHelper<IncomingCompleteArgs, State, OutgoingCompleteArgs> {
    constructor(
        context: BotContext,
        instance: TopicInstance<State>,
        data: TopicMethodHelperData<OutgoingCompleteArgs>,
        args: IncomingCompleteArgs,
        public childInstanceName: string,
    ) {
        super(context, instance, data, args);
    }
}

const returnsPromiseVoid = () => Promise.resolve(); // a little more efficient than creating a new one every time

export class Topic <
    InitArgs extends {} = {},
    State extends {} = {},
    CompleteArgs extends {} = {},
> {
    private static topics: {
        [name: string]: Topic;
    } = {}

    protected _init: TopicInit<InitArgs, State, CompleteArgs, Promise<void>> = returnsPromiseVoid;
    protected _next: TopicMethod<State, CompleteArgs, Promise<void>> = returnsPromiseVoid;
    protected _onReceive: TopicMethod<State, CompleteArgs, Promise<void>> = returnsPromiseVoid;

    constructor (
        public name: string
    ) {
        if (Topic.topics[name]) {
            throw new Error(`An attempt was made to create a topic with existing name "${name}".`);
        }
        
        Topic.topics[name] = this;
    }

    async createInstance (
        context: BotContext,
        parentInstanceName?: string,
        args?: InitArgs,
    ) {
        const instance = new TopicInstance<State>(this.name, parentInstanceName);

        context.state.conversation.topical.instances[instance.name] = instance;

        const data = {} as TopicMethodHelperData<CompleteArgs>;
        
        await toPromise(this._init(context, new TopicInitHelper(context, instance, data, args)));

        if (data.topicMethod === TopicMethods.complete) {
            await Topic.complete(context, instance, data.args);

            return undefined;
        } else {
            if (data.topicMethod === TopicMethods.next) {
                await Topic.next(context, instance.name);
            } else if (data.topicMethod === TopicMethods.dispatch) {
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

        const data = {} as TopicMethodHelperData<any>;

        await topic._next(context, new TopicMethodHelper(context, instance, data));

        if (data.topicMethod === TopicMethods.next) {
            await Topic.next(context, instanceName);
        } else if (data.topicMethod === TopicMethods.complete) {
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

        const data = {} as TopicMethodHelperData<any>;

        await topic._onReceive(context, new TopicMethodHelper(context, instance, data));

        if (data.topicMethod === TopicMethods.next) {
            await Topic.next(context, instanceName);
        } else if (data.topicMethod === TopicMethods.complete) {
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

        const data = {} as TopicMethodHelperData<any>;
    
        const topicCompleteHelper = new TopicOnCompleteHelper(context, parentInstance, data, args, instance.name);

        delete context.state.conversation.topical.instances[instance.name];

        await topic._completeHandlers[instance.topicName](context, topicCompleteHelper);

        if (data.topicMethod === TopicMethods.next) {
            await Topic.next(context, parentInstance.name);
        } else if (data.topicMethod === TopicMethods.complete) {
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
        next: TopicMethod<State, CompleteArgs, Promiseable<void>>,
    ): this {
        this._next = (context, topic) => toPromise(next(context, topic));

        return this;
    }

    onReceive (
        onReceive: TopicMethod<State, CompleteArgs, Promiseable<void>>,
    ): this {
        this._onReceive = (context, instance) => toPromise(onReceive(context, instance));

        return this;
    }

    private _completeHandlers: {
        [topicName: string]: TopicOnComplete<any, any, any, Promise<void>>;
    } = {}

    onComplete <C> (
        topic: Topic<any, any, C>,
        completeHandler: TopicOnComplete<State, C, CompleteArgs, Promiseable<void>> = returnsPromiseVoid,
    ): this {
        if (this._completeHandlers[topic.name])
            throw new Error(`An attempt was made to call onComplete for topic ${topic.name}. This topic is already handled.`);

        this._completeHandlers[topic.name] = (context, topic) => toPromise(completeHandler(context, topic));

        return this;
    }
}
