import { Promiseable } from 'botbuilder';
import { toPromise } from './helpers';

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
    ReturnArgs,
    T
> = (
    context: BotContext,
    topic: TopicInitContext<InitArgs, State, ReturnArgs>,
) => T;

export enum TopicMethods {
    next,
    returnToParent,
    dispatchToSelf,
}

export type TopicMethod <
    State,
    ReturnArgs,
    T
> = (
    context: BotContext,
    topic: TopicContext<State, ReturnArgs>,
) => T;

export interface TopicContextData <ReturnArgs> {
    topicMethod?: TopicMethods;
    args?: ReturnArgs;
}

export class TopicContext <State, ReturnArgs> {
    constructor(
        protected context: BotContext,
        public instance: TopicInstance<State>,
        protected data: TopicContextData <ReturnArgs>,
    ) {
    }

    createTopicInstance <_InitArgs> (
        topic: TopicClass<_InitArgs>,
        args?: _InitArgs,
    ) {
        return topic.createInstance(this.context, this.instance.name, args);
    }

    next () {
        if (this.data.topicMethod)
            throw "you may only call one of next(), dispatchToSelf(), or returnToParent()";
        
        this.data.topicMethod = TopicMethods.next;
    }

    returnToParent (
        args?: ReturnArgs,
    ) {
        if (this.data.topicMethod)
            throw "you may only call one of next(), dispatchToSelf(), or returnToParent()";
        
        this.data.topicMethod = TopicMethods.returnToParent;
        this.data.args = args;
    }

    dispatchToSelf () {
        if (this.data.topicMethod)
            throw "you may only call one of next(), dispatchToSelf(), or returnToParent()";
        
        this.data.topicMethod = TopicMethods.dispatchToSelf;
    }

    dispatchToInstance (
        instanceName: string
    ) {
        return TopicClass.dispatch(this.context, instanceName);
    }
}

export class TopicInitContext <
    InitArgs,
    State,
    ReturnArgs,
> extends TopicContext<State, ReturnArgs> {
    constructor(
        context: BotContext,
        instance: TopicInstance<State>,
        data: TopicContextData <ReturnArgs>,
        public args: InitArgs,
    ) {
        super(context, instance, data);
    }
}

export type TopicOnChildReturn <
    State,
    IncomingReturnArgs,
    OutgoingReturnArgs,
    T
> = (
    context: BotContext,
    topicOnChildReturnHelper: TopicOnChildReturnContext<State, IncomingReturnArgs, OutgoingReturnArgs>,
) => T;

export class TopicOnChildReturnContext <
    State,
    IncomingReturnArgs,
    OutgoingReturnArgs,
> extends TopicInitContext<IncomingReturnArgs, State, OutgoingReturnArgs> {
    constructor(
        context: BotContext,
        instance: TopicInstance<State>,
        data: TopicContextData<OutgoingReturnArgs>,
        args: IncomingReturnArgs,
        public childInstanceName: string,
    ) {
        super(context, instance, data, args);
    }
}

const returnsPromiseVoid = () => Promise.resolve(); // a little more efficient than creating a new one every time

export class TopicClass <
    InitArgs extends {} = {},
    State extends {} = {},
    ReturnArgs extends {} = {},
> {
    private static topicClasses: {
        [name: string]: TopicClass;
    } = {}

    protected _init: TopicInit<InitArgs, State, ReturnArgs, Promise<void>> = returnsPromiseVoid;
    protected _next: TopicMethod<State, ReturnArgs, Promise<void>> = returnsPromiseVoid;
    protected _onReceive: TopicMethod<State, ReturnArgs, Promise<void>> = returnsPromiseVoid;
    protected _afterChildReturn: TopicOnChildReturn<State, any, any, Promise<void>> = returnsPromiseVoid;

    constructor (
        public name: string,
    ) {
        if (TopicClass.topicClasses[name]) {
            throw new Error(`An attempt was made to create a topic with existing name "${name}".`);
        }
        
        TopicClass.topicClasses[name] = this;
    }

    async createInstance (
        context: BotContext,
        parentInstanceName?: string,
        args?: InitArgs,
    ) {
        const instance = new TopicInstance<State>(this.name, parentInstanceName);

        context.state.conversation.topical.instances[instance.name] = instance;

        const data = {} as TopicContextData<ReturnArgs>;
        
        await toPromise(this._init(context, new TopicInitContext(context, instance, data, args)));

        switch (data.topicMethod) {
            case TopicMethods.returnToParent:
                await TopicClass.returnToParent(context, instance, data.args);
                return undefined;

            case TopicMethods.next:
                await TopicClass.next(context, instance.name);
                break;

            case TopicMethods.dispatchToSelf: 
                await TopicClass.dispatch(context, instance.name);
                break;
        }

        return instance.name;
    }

    static async do (
        context: BotContext,
        getRootInstanceName: () => Promise<string>
    ) {
        if (!context.state.conversation.topical) {
            context.state.conversation.topical = {
                instances: {},
                rootInstanceName: undefined
            }
    
            context.state.conversation.topical.rootInstanceName = await getRootInstanceName();    
        }
            
        await TopicClass.dispatch(context, context.state.conversation.topical.rootInstanceName);
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

        const topic = TopicClass.topicClasses[instance.topicName];
        
        if (!topic) {
            console.warn(`Unknown topic ${instance.topicName}`);
            return;
        }

        const data = {} as TopicContextData<any>;

        await topic._next(context, new TopicContext(context, instance, data));

        switch (data.topicMethod) {
            case TopicMethods.next:
                await TopicClass.next(context, instanceName);
                break;

            case TopicMethods.returnToParent:
                await TopicClass.returnToParent(context, instance, data.args);
                break;

            case TopicMethods.dispatchToSelf:
                throw "you may not call dispatchToSelf() here"
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

        const topic = TopicClass.topicClasses[instance.topicName];
        
        if (!topic) {
            console.warn(`Unknown topic ${instance.topicName}`);
            return;
        }

        const data = {} as TopicContextData<any>;

        await topic._onReceive(context, new TopicContext(context, instance, data));

        switch (data.topicMethod) {
            case TopicMethods.next:
                await TopicClass.next(context, instanceName);
                break;

            case TopicMethods.returnToParent:
                await TopicClass.returnToParent(context, instance, data.args);
                break;

            case TopicMethods.dispatchToSelf:
                throw "you may not call dispatchToSelf() here"
        }
    }

    static async returnToParent <ReturnArgs = any> (
        context: BotContext,
        instance: TopicInstance<any>,
        args: ReturnArgs,
    ) {
        if (!instance.parentInstanceName) {
            return;
        }
                
        const parentInstance = context.state.conversation.topical.instances[instance.parentInstanceName];

        if (!parentInstance) {
            console.warn(`Unknown parent instance ${instance.parentInstanceName}`);
            return;
        }

        const topic = TopicClass.topicClasses[parentInstance.topicName];

        if (!topic) {
            console.warn(`Unknown topic ${parentInstance.topicName}`);
            return;
        }

        const data = {} as TopicContextData<any>;
    
        const topicOnChildReturnContext = new TopicOnChildReturnContext(context, parentInstance, data, args, instance.name);

        delete context.state.conversation.topical.instances[instance.name];

        await topic._onChildReturnHandlers[instance.topicName](context, topicOnChildReturnContext);

        switch (data.topicMethod) {
            case TopicMethods.next:
                await TopicClass.next(context, parentInstance.name);
                break;

            case TopicMethods.returnToParent:
                await TopicClass.returnToParent(context, parentInstance, data.args);
                break;

            case TopicMethods.dispatchToSelf:
                throw "you may not call dispatchToSelf() here"
        }
    }

    init (
        init: TopicInit<InitArgs, State, ReturnArgs, Promiseable<void>>,
    ): this {
        this._init = (context, topic) => toPromise(init(context, topic));
    
        return this;
    }

    next (
        next: TopicMethod<State, ReturnArgs, Promiseable<void>>,
    ): this {
        this._next = (context, topic) => toPromise(next(context, topic));

        return this;
    }

    onReceive (
        onReceive: TopicMethod<State, ReturnArgs, Promiseable<void>>,
    ): this {
        this._onReceive = (context, instance) => toPromise(onReceive(context, instance));

        return this;
    }

    private _onChildReturnHandlers: {
        [topicName: string]: TopicOnChildReturn<any, any, any, Promise<void>>;
    } = {}

    
    afterChildReturn (
        cleanup: TopicOnChildReturn<State, any, any, Promiseable<void>>,
    ): this {
        this._afterChildReturn = (context, topic) => toPromise(cleanup(context, topic));

        return this;
    }

    onChildReturn <C> (
        topic: TopicClass<any, any, C>,
        onChildReturnHandler: TopicOnChildReturn<State, C, ReturnArgs, Promiseable<void>> = returnsPromiseVoid,
    ): this {
        if (this._onChildReturnHandlers[topic.name])
            throw new Error(`An attempt was made to call onChildReturn for topic ${topic.name}. This topic is already handled.`);

        this._onChildReturnHandlers[topic.name] = async (context, topic) => {
            await toPromise(onChildReturnHandler(context, topic));
            await this._afterChildReturn(context, topic);
        }

        return this;
    }
}
