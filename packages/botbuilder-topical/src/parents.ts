import { Topic, Topicable } from './topical';
import { BotContext } from 'botbuilder';

export interface TopicWithChildState {
    child?: string;
}

export abstract class TopicWithChild <
    InitArgs extends {} = {},
    State extends TopicWithChildState = TopicWithChildState,
    ReturnArgs extends {} = {},
    Construct extends {} = {},
    Context extends BotContext = BotContext, 
> extends Topic<InitArgs, State, ReturnArgs, Construct, Context> {

    clearChild () {
        if (this.state.child) {
            Topic.deleteInstance(this.context, this.state.child);
            this.state.child = undefined;
        }
    }

    setChild (
        childInstanceName: string,
    ) {
        if (this.state.child)
            this.clearChild();
        this.state.child = childInstanceName;
    }

    async createChild <
        T extends Topicable<Init, State, any, Construct, Context>,
        Init,
        State,
        Construct,
    > (
        topicClass: T,
        args?: Init,
        construct?: Construct,
    ) {
        this.setChild(await (topicClass as any).create(this, args));
    }

    hasChild () {
        return !!this.state.child;
    }

    async dispatchToChild () {
        return this.dispatchTo(this.state.child);
    }

    listChildren () {
        return this.state.child ? [this.state.child] : [];
    }
}

export interface TopicWithChildArrayState {
    children: string[];
}

export abstract class TopicWithChildArray <
    InitArgs extends {} = {},
    State extends TopicWithChildArrayState = TopicWithChildArrayState,
    ReturnArgs extends {} = {},
    Construct extends {} = {},
    Context extends BotContext = BotContext,
> extends Topic<InitArgs, State, ReturnArgs, Context> {
    async removeChild (
        child: string,
    ) {
        Topic.deleteInstance(this.context, child);
        this.state.children = this.state.children.filter(_child => _child !== child);
    }

    async init () {
        this.state.children = [];
    }

    listChildren () {
        return this.state.children;
    }
}
