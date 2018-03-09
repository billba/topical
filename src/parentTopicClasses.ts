import { TopicClass, TopicInstance } from './topical';

export abstract class ParentTopicClass <
    InitArgs extends {} = {},
    State extends {} = {},
    ReturnArgs extends {} = {},
> extends TopicClass <InitArgs, State, ReturnArgs> {
    abstract removeChild (
        context: BotContext,
        instance: TopicInstance<State>,
        childInstance: TopicInstance
    ): Promise<void>;
}

export interface TopicClassWithChildState {
    child: string;
}

export class TopicClassWithChild <
    InitArgs extends {} = {},
    State extends TopicClassWithChildState = TopicClassWithChildState,
    ReturnArgs extends {} = {},
> extends ParentTopicClass <InitArgs, State, ReturnArgs> {
    async removeChild(
        context: BotContext,
        instance: TopicInstance<State>,
        childInstance: TopicInstance
    ) {
        instance.state.child = undefined;
    }

    async listChildren(
        context: BotContext,
        instance: TopicInstance<State>,
    ) {
        return instance.state.child ? [instance.state.child] : [];
    }
}

export interface TopicClassWithChildArrayState {
    children: string[];
}

export class TopicClassWithChildArray <
    InitArgs extends {} = {},
    State extends TopicClassWithChildArrayState = TopicClassWithChildArrayState,
    ReturnArgs extends {} = {},
> extends ParentTopicClass<InitArgs, State, ReturnArgs> {
    async removeChild (
        context: BotContext,
        instance: TopicInstance<State>,
        childInstance: TopicInstance)
    {
        instance.state.children = instance.state.children.filter(child => child !== childInstance.name);
    }

    async init(
        context: BotContext,
        instance: TopicInstance<State>,
    ) {
        instance.state.children = [];
    }

    async listChildren(
        context: BotContext,
        instance: TopicInstance<State>,
    ) {
        return instance.state.children;
    }
}
