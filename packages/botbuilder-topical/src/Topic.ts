import { Promiseable, Activity, TurnContext, Storage, BotState } from 'botbuilder';
import { toPromise, returnsPromiseVoid, Telemetry, TelemetryAction } from './topical';

export interface TopicInstance <State = any, Constructor = any> {
    instanceName: string;
    topicName: string;
    begun: boolean;
    constructorArgs: Constructor,
    children: string[];
    state: State;
}

interface Topical {
    instances: {
        [instanceName: string]: TopicInstance;
    },
    rootInstanceName: string;
}

enum TopicReturnStatus {
    noReturn,
    signalled,
    succeeded,
}

export interface Topicable <
    Begin = any,
    State = any,
    Return = any,
    Constructor = any,
    Context extends TurnContext = TurnContext, 
> {
    new (
        args: Constructor,
    ): Topic<Begin, State, Return, Constructor, Context>;
}

export interface TopicInitOptions {
    telemetry: Telemetry;
}

export interface TriggerResult <Begin> {
    beginArgs?: Begin;
    score: number;
}

export abstract class Topic <
    Begin = any,
    State = any,
    Return = any,
    Constructor = any,
    Context extends TurnContext = TurnContext, 
> {
    private static topicalState: BotState<Topical>;

    private static telemetry: Telemetry;

    public static init(
        storage: Storage,
        options?: TopicInitOptions,
    ) {
        if (Topic.topicalState)
            throw "you should only call Topic.init once.";

        Topic.topicalState = new BotState<Topical>(storage, context => `topical:${context.activity.channelId}.${context.activity.conversation.id}`);

        if (options) {
            if (options.telemetry)
                Topic.telemetry = options.telemetry;
        }
    }

    private static topics: {
        [name: string]: Topicable;
    } = {}

    protected static subtopics = [] as Topicable[];

    // it's really easy to forget the "static" on subtopics -- this helps avoid errors
    public set subtopics(subtopics: never) {
        throw "subtopics need to be set as a static";
    }

    protected static register() {

        for (const T of this.subtopics)
            (T as any).register();

        if (this === Topic)
            return;

        const T = Topic.topics[this.name];

        if (T) {

            if (T === this as any)
                return; // no need to re-register
            throw `A different topic with name ${T.name} has already been registered.`
        }

        Topic.topics[this.name] = this as any;
    }

    public get state () {

        return this.topicInstance.state;
    }

    public set state (
        state: State,
    ) {

        this.topicInstance.state = state;
    }

    public get instanceName () {

        return this.topicInstance.instanceName;
    }

    public get begun () {

        return this.topicInstance.begun;
    }

    public set begun (
        begun: boolean,
    ) {

        this.topicInstance.begun = begun;
    }

    public get children () {

        return this.topicInstance.children;
    }

    public set children (
        children: string[],
    ) {

        this.topicInstance.children = children;
    }

    private returnStatus = TopicReturnStatus.noReturn;
    public return?: Return;

    private topicInstance!: TopicInstance<State>;

    public context!: Context;

    public parent?: Topic<any, any, any, any, Context>;
    public text?: string;

    constructor (
        args: Constructor,
    ) {
    }

    protected static createInstance <
        T extends Topicable<Begin, any, any, Constructor, Context>,
        Begin,
        Constructor,
        Context extends TurnContext,
    > (
        this: T,
        context: Context,
        constructorArgs?: Constructor,
    ) {

        const topicName = this.name;

        if (!Topic.topics[topicName])
            throw `An attempt was made to create an instance of unregistered topic ${topicName}.`;

        const instanceName = `${this.name}(${Date.now().toString()}${Math.random().toString().substr(1)})`;

        const instance: TopicInstance = {
            instanceName,
            topicName,
            constructorArgs,
            state: {},
            children: [],
            begun: false,
        }

        Topic.topicalState.get(context)!.instances[instanceName] = instance;

        return instanceName;
    }

    createTopicInstance <
        T extends Topicable<any, any, any, Constructor, Context>,
        Constructor,
    > (
        topicClass: T,
        constructorArgs?: Constructor,
    ): string {

        return (topicClass as any).createInstance(this.context, constructorArgs);
    }

    protected static loadInstance <Context extends TurnContext> (
        parentOrContext: Topic<any, any, any, any, Context> | Context,
        instance: string | TopicInstance,
    ): Topic<any, any, any, any, Context> {

        let parent: Topic<any, any, any, any, Context> | undefined;
        let context: Context;

        if (parentOrContext instanceof Topic) {
            parent = parentOrContext;
            context = parentOrContext.context;
        } else {
            parent = undefined;
            context = parentOrContext;
        }

        if (typeof instance === 'string')
            instance = Topic.getInstanceFromName(context, instance);

        const T = Topic.topics[instance.topicName];
        if (!T)
            throw `An attempt was made to load unregistered topic ${instance.topicName}.`

        const topic = new T(instance.constructorArgs) as Topic<any, any, any, any, Context>;

        topic.context = context;
        topic.parent = parent;
        topic.topicInstance = instance;
        topic.text = context.activity.type === 'message' ? context.activity.text.trim() : undefined;

        return topic;
    }

    protected loadTopicInstance (
        instance: string | TopicInstance,
    ): Topic<any, any, any, any, Context> {

        return Topic.loadInstance(this, instance);
    }

    protected static async beginInstance <
        Context extends TurnContext,
    > (
        parentOrContext: Topic<any, any, any, any, Context> | Context,
        instanceName: string,
        beginArgs?: any,
    ): Promise<Topic<any, any, any, any, Context> | undefined> {

        const topic = Topic.loadInstance(parentOrContext, instanceName);

        // await this.sendTelemetry(context, newInstance, 'init.begin');

        topic.begun = true;

        await topic.onBegin(beginArgs);

        if (await topic.returnedToParent())
            return undefined;

        // await this.sendTelemetry(context, newInstance, 'init.end');

        return topic;
    }

    async beginTopicInstance <
        T extends Topicable<Begin, any, any, Constructor, Context>,
        Begin,
        Constructor,
    > (
        topicClass: T,
        beginArgs?: Begin,
        constructorArgs?: Constructor,
    ): Promise<string | undefined> {

        const instanceName = this.createTopicInstance(topicClass, constructorArgs);
        const topic = await Topic.beginInstance(this, instanceName, beginArgs);
        return topic && instanceName;
    }

    public returnToParent(
        args?: Return,
    ) {

        if (this.returnStatus != TopicReturnStatus.noReturn)
            throw "already returned";

        this.returnStatus = TopicReturnStatus.signalled;
        this.return = args;
    }

    protected static deleteInstance (
        context: TurnContext,
        instanceName: string,
    ) {

        delete Topic.topicalState.get(context)!.instances[instanceName];
    }

    protected static rootInstanceName(
        context: TurnContext,
    ) {

        return Topic.topicalState.get(context)!.rootInstanceName;
    }

    public static async do <
        T extends Topicable<Begin, any, any, Constructor, Context>,
        Begin,
        Constructor,
        Context extends TurnContext = TurnContext
    > (
        this: T,
        context: Context,
        beginArgs?: Begin,
        constructorArgs?: Constructor,
    ) {

        if (this === Topic as any)
            throw "You can only `do' a child of Topic.";

        if (!Topic.topicalState)
            throw "You must call Topic.init before calling YourTopic.do";

        if (!Topic.topics[this.name])
            (this as any).register();

        const topical = await Topic.topicalState.read(context) as Topical | Partial<Topical>;
        const state = Topic.topicalState.get(context);

        if (topical.rootInstanceName) {
            await Topic.loadInstance(context, topical.rootInstanceName).onTurn();

            // garbage collect orphaned instances

            // const orphans = { ... topical.instances };

            // const deorphanize = (instanceName: string) => {
            //     const instance = orphans[instanceName];
            //     if (!instance)
            //         throw "unexpected";

            //     const topic = Topic.load(context, instance);

            //     delete orphans[instanceName];
        
            //     for (let child of topic.listChildren())
            //         deorphanize(child);
            // }

            // deorphanize(rootInstanceName);

            // for (const orphan of Object.keys(orphans)) {
            //     console.warn(`Garbage collecting instance ${orphan} -- you should have called Topic.deleteInstance()`)
            //     Topic.deleteInstance(context, orphan);
            // }

            // await topic.sendTelemetry(context, instance, 'endOfTurn');
        } else {

            topical.instances = {};
            topical.rootInstanceName = (this as any).createInstance(context, constructorArgs);
            if (!await Topic.beginInstance(context, topical.rootInstanceName!, beginArgs))
                throw "Root topics shouldn't even returnToParent."

            // const instance = Topic.getInstanceFromName(context, topical.rootInstanceName);
            // const topic = Topic.load(context, instance);
            // await topic.sendTelemetry(context, instance, 'assignRootTopic');
        }

        await Topic.topicalState.write(context);
    }

    private static getInstanceFromName (
        context: TurnContext,
        instanceName: string,
    ) {

        const instance = Topic.topicalState.get(context)!.instances[instanceName];

        if (!instance)
            throw `Unknown instance ${instanceName}`;

        return instance;
    }

    public async dispatchTo (
        instanceName: string | undefined,
    ) {

        if (!instanceName)
            return false;

        const instance = Topic.getInstanceFromName(this.context, instanceName);

        if (!instance)
            return false;

        const topic = this.loadTopicInstance(instance);

        if (!topic.begun)
            return false;

        // await topic.sendTelemetry(context, instance, 'onReceive.begin');
        await topic.onTurn();
        await topic.returnedToParent();
        // await topic.sendTelemetry(context, instance, 'onReceive.end');
        
        return true;
    }

    private async returnedToParent (): Promise<boolean> {

        if (this.returnStatus !== TopicReturnStatus.signalled)
            return false;

        if (!this.parent)
            throw `orphan ${this.instanceName} attempted to returnToParent()`;

        Topic.deleteInstance(this.context, this.instanceName);
        this.returnStatus = TopicReturnStatus.succeeded;

        // await parentTopic.sendTelemetry(context, parentInstance, 'onChildReturn.begin');

        await this.parent.onChildReturn(this);
        await this.parent.returnedToParent();

        // await parentTopic.sendTelemetry(context, parentInstance, 'onChildReturn.end');

        return true;
    }

    // private async sendTelemetry (
    //     context: Context,
    //     instance: TopicInstance,
    //     type: string,
    // ) {
    //     if (!Topic.telemetry)
    //         return;

    //     await Topic.telemetry({
    //         type,
    //         activity: context.activity as Activity,
    //         instance: {
    //             instanceName: instance.instanceName,
    //             topicName: this.name,
    //             children: this.listChildren(context, instance),
    //         },
    //     });
    // }

    public async clearChildren () {
        for (const child in this.children) {
            Topic.deleteInstance(this.context, child);
        }

        this.children = [];
    }

    public async removeChild (
        child: string,
    ) {
        Topic.deleteInstance(this.context, child);
        this.children = this.children.filter(_child => _child !== child);
    }

    public setChild (
        childInstanceName: string | undefined,
    ) {
        this.clearChildren();
        if (childInstanceName)
            this.children[0] = childInstanceName;
    }

    async beginChild <
        T extends Topicable<Begin, any, any, Constructor, Context>,
        Begin,
        Constructor,
    > (
        topicClass: T,
        beginArgs?: Begin,
        constructorArgs?: Constructor,
    ) {
        this.setChild(await this.beginTopicInstance(topicClass, beginArgs, constructorArgs))
    }

    public hasChildren () {
        return this.children.length !== 0;
    }

    public async dispatchToChild () {
        return this.dispatchTo(this.children.length ? this.children[0] : undefined);
    }

    public async tryTriggers () {
        const results = (await Promise.all(this
            .children
            .map(child => this.loadTopicInstance(child).trigger().then(result => ({
                child,
                result: result || { score: 0}
            })))
        ))
        .filter(i => i.result.score > 0)
        .sort((a, b) => b.result.score - a.result.score);

        if (results.length) {
            await Topic.beginInstance(this, results[0].child, results[0].result.beginArgs);
            return true;
        }

        return false;
    }

    // These four default methods are optionally overrideable by subclasses

    public async trigger (): Promise<TriggerResult<Begin> | void> {
    }

    public async onBegin (
        args?: Begin,
    ) {
    }

    public async onTurn () {
        if (await this.dispatchToChild())
            return;
    }

    public async onChildReturn(
        child: Topic<any, any, any, any, Context>,
    ) {
        this.clearChildren();
    }
}

