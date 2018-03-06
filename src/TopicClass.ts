import { Promiseable } from 'botbuilder';
import { toPromise, returnsPromiseVoid } from './helpers';

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

enum TopicReturn {
    signalled,
    succeeded,
}

export class TopicInstance <State = any, ReturnArgs = any> {
    public name: string;
    public state = {} as State;
    public return: TopicReturn;
    public returnArgs: ReturnArgs;

    constructor(
        public topicName: string,
        public parentInstanceName?: string,
    ) {
        this.name = `instance of "${topicName}"(${Date.now().toString()}${Math.random().toString().substr(1)})`;
    }
}

export type TopicClassOnChildReturnHandler <State, ReturnArgs, ChildReturnArgs> = (
    context: BotContext,
    instance: TopicInstance<State, ReturnArgs>,
    childInstance: TopicInstance<undefined, ChildReturnArgs>,
) => Promise<void>;

export class TopicClass <
    InitArgs extends {} = {},
    State extends {} = {},
    ReturnArgs extends {} = {},
> {
    private static topicClasses: {
        [name: string]: TopicClass;
    } = {}

    constructor (
        public name: string,
    ) {
        if (TopicClass.topicClasses[name]) {
            throw new Error(`An attempt was made to create a topic with existing name "${name}".`);
        }

        TopicClass.topicClasses[name] = this;
    }

    returnToParent(
        instance: TopicInstance<State>,
        args?: ReturnArgs,
    ) {
        if (instance.return)
            throw "already returned";
        instance.return = TopicReturn.signalled;
        instance.returnArgs = args;
    }

    async createInstance (
        context: BotContext,
        parentInstance?: TopicInstance,
        args?: InitArgs,
    ) {
        const newInstance = new TopicInstance(this.name, parentInstance && parentInstance.name);

        context.state.conversation.topical.instances[newInstance.name] = newInstance;

        await toPromise(this.init(context, newInstance, args));

        if (await this.returnedToParent(context, newInstance))
            return undefined;

        return newInstance.name;
    }

    static rootInstanceName(
        context: BotContext,
    ) {
        return context.state.conversation.topical
            ? context.state.conversation.topical.rootInstanceName
            : undefined;
    }

    static async do (
        context: BotContext,
        getRootInstanceName: () => Promise<string>,
    ) {
        if (context.state.conversation.topical) {
            await TopicClass.getTopicFromInstance(TopicClass.getInstanceFromName(context, context.state.conversation.topical.rootInstanceName))
                .dispatch(context, context.state.conversation.topical.rootInstanceName);
        } else {
            context.state.conversation.topical = {
                instances: {},
                rootInstanceName: undefined
            }
    
            context.state.conversation.topical.rootInstanceName = await getRootInstanceName();    
        }    
    }

    private static getInstanceFromName (
        context: BotContext,
        instanceName: string,
    ) {
        const instance = context.state.conversation.topical.instances[instanceName];

        if (!instance) {
            console.warn(`Unknown instance ${instanceName}`);
            return;
        }

        return instance;
    }

    private static getTopicFromInstance (
        instance: TopicInstance,
    ) {
        const topic = TopicClass.topicClasses[instance.topicName];
        
        if (!topic) {
            console.warn(`Unknown topic ${instance.topicName}`);
            return;
        }

        return topic;
    }

    async doNext (
        context: BotContext,
        instanceName: string,
    ) {
        if (!instanceName)
            return false;

        const instance = TopicClass.getInstanceFromName(context, instanceName);
        const topic = TopicClass.getTopicFromInstance(instance);

        await topic.next(context, instance);
        await this.returnedToParent(context, instance);

        return true;
    }

    async dispatch (
        context: BotContext,
        instanceName: string,
    ) {
        if (!instanceName)
            return false;

        const instance = TopicClass.getInstanceFromName(context, instanceName);
        const topic = TopicClass.getTopicFromInstance(instance);

        await topic.onReceive(context, instance);
        await this.returnedToParent(context, instance);
        
        return true;
    }

    private async returnedToParent (
        context: BotContext,
        instance: TopicInstance<any>,
    ): Promise<boolean> {
        if (instance.return !== TopicReturn.signalled || !instance.parentInstanceName)
            return false;

        const parentInstance = TopicClass.getInstanceFromName(context, instance.parentInstanceName);
        const topic = TopicClass.getTopicFromInstance(parentInstance);

        delete context.state.conversation.topical.instances[instance.name];
        instance.return = TopicReturn.succeeded;
        instance.state = undefined; // to stop parents from peaking at the implementation details of their children.

        const handler = topic._onChildReturnHandlers[instance.topicName];
        if (!handler)
            throw `No onChildReturn() for topic ${instance.topicName}`;

        await handler(context, parentInstance, instance);
        await topic._afterChildReturn(context, parentInstance, instance);
        await topic.returnedToParent(context, parentInstance);

        return true;
    }

    async init (
        context: BotContext,
        instance: TopicInstance<State, ReturnArgs>,
        args?: InitArgs,
    ) {
    }

    async next (
        context: BotContext,
        instance: TopicInstance<State, ReturnArgs>,
    ) {
    }

    async onReceive (
        context: BotContext,
        instance: TopicInstance<State, ReturnArgs>,
    ) {
    }

    private _onChildReturnHandlers: {
        [topicName: string]: TopicClassOnChildReturnHandler<any, any, any>;
    } = {};
    
    protected onChildReturn <ChildReturnArgs> (
        topic: TopicClass<any, any, ChildReturnArgs>,
        handler: TopicClassOnChildReturnHandler<State, ReturnArgs, ChildReturnArgs> = returnsPromiseVoid
    ) {
        if (this._onChildReturnHandlers[topic.name])
            throw new Error(`An attempt was made to call onChildReturn for topic ${topic.name}. This topic is already handled.`);

        this._onChildReturnHandlers[topic.name] = handler;

        return this;
    }

    private _afterChildReturn: TopicClassOnChildReturnHandler<any, any, any> = returnsPromiseVoid;
    
    protected afterChildReturn <ChildReturnArgs> (
        handler: TopicClassOnChildReturnHandler<State, ReturnArgs, any>
    ) {
        if (this._afterChildReturn !== returnsPromiseVoid)
            throw new Error(`You can only set up one afterChildReturn handler.`);

        this._afterChildReturn = handler;
    }

}
