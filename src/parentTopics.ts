import { Topic } from './topical';

export abstract class ParentTopic <
    InitArgs extends {} = {},
    State extends {} = {},
    ReturnArgs extends {} = {},
> extends Topic <InitArgs, State, ReturnArgs> {
    abstract removeChild (
        context: BotContext,
        childInstance: Topic,
    ): Promise<void>;
}

export interface TopicWithChildState {
    child: Topic;
}

export class TopicWithChild <
    InitArgs extends {} = {},
    State extends TopicWithChildState = TopicWithChildState,
    ReturnArgs extends {} = {},
> extends ParentTopic <InitArgs, State, ReturnArgs> {
    async removeChild(
        context: BotContext,
        childInstance: Topic,
    ) {
        this.state.child = undefined;
    }

    listChildren(
        context: BotContext,
    ) {
        return this.state.child ? [this.state.child] : [];
    }
}

export interface TopicClassWithChildArrayState {
    children: Topic[];
}

export class TopicWithChildArray <
    InitArgs extends {} = {},
    State extends TopicClassWithChildArrayState = TopicClassWithChildArrayState,
    ReturnArgs extends {} = {},
> extends ParentTopic<InitArgs, State, ReturnArgs> {
    async removeChild (
        context: BotContext,
        childInstance: Topic
    ) {
        this.state.children = this.state.children.filter(child => child !== childInstance);
    }

    async init(
        context: BotContext,
    ) {
        this.state.children = [];
    }

    listChildren(
        context: BotContext,
    ) {
        return this.state.children;
    }
}
