import { Topic } from './topical';

export abstract class ParentTopic <
    InitArgs extends {} = {},
    State extends {} = {},
    ReturnArgs extends {} = {},
> extends Topic <InitArgs, State, ReturnArgs> {
}

export interface TopicWithChildState {
    child: Topic;
}

export class TopicWithChild <
    InitArgs extends {} = {},
    State extends TopicWithChildState = TopicWithChildState,
    ReturnArgs extends {} = {},
> extends ParentTopic <InitArgs, State, ReturnArgs> {
    clearChild (
    ) {
        this.state.child = undefined;
    }

    setChild (
        child: Topic,
    ) {
        this.state.child = child;
    }

    hasChild (
    ) {
        return !!this.state.child;
    }

    async dispatchToChild (
        context: BotContext,
    ) {
        return this.dispatch(context, this.state.child);
    }


    listChildren(
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
        child: Topic
    ) {
        this.state.children = this.state.children.filter(_child => _child !== child);
    }

    async init(
        context: BotContext,
    ) {
        this.state.children = [];
    }

    listChildren(
    ) {
        return this.state.children;
    }
}
