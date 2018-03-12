import { TopicClass, TopicInstance } from './topical';

export abstract class ParentTopicClass <
    InitArgs extends {} = {},
    State extends {} = {},
    ReturnArgs extends {} = {},
> extends TopicClass<InitArgs, State, ReturnArgs> {
}

export interface TopicClassWithChildState {
    child: string;
}

export class TopicClassWithChild <
    InitArgs extends {} = {},
    State extends TopicClassWithChildState = TopicClassWithChildState,
    ReturnArgs extends {} = {},
> extends ParentTopicClass<InitArgs, State, ReturnArgs> {
    clearChild (
        context: BotContext,
        instance: TopicInstance<State>,
    ) {
        if (instance.state.child) {
            TopicClass.deleteInstance(context, instance.state.child);
            instance.state.child = undefined;
        }
    }

    setChild (
        context: BotContext,
        instance: TopicInstance<State>,
        childInstanceName: string,
    ) {
        if (instance.state.child)
            this.clearChild(context, instance);
        instance.state.child = childInstanceName;
    }

    hasChild (
        context: BotContext,
        instance: TopicInstance<State>,
    ) {
        return !!instance.state.child;
    }

    async dispatchToChild (
        context: BotContext,
        instance: TopicInstance<State>,
    ) {
        return this.dispatch(context, instance.state.child);
    }

    listChildren (
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
        childInstance: TopicInstance
    ) {
        TopicClass.deleteInstance(context, childInstance.state.child);
        instance.state.children = instance.state.children.filter(child => child !== childInstance.name);
    }

    async init (
        context: BotContext,
        instance: TopicInstance<State>,
    ) {
        instance.state.children = [];
    }

    listChildren (
        context: BotContext,
        instance: TopicInstance<State>,
    ) {
        return instance.state.children;
    }
}
