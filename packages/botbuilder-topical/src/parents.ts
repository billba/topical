import { Topic, TopicInstance } from './topical';
import { BotContext } from 'botbuilder';

export interface TopicWithChildState {
    child: string;
}

export abstract class TopicWithChild <
    InitArgs extends {} = {},
    State extends TopicWithChildState = TopicWithChildState,
    ReturnArgs extends {} = {},
> extends Topic<InitArgs, State, ReturnArgs> {
    clearChild (
        context: BotContext,
        instance: TopicInstance<State>,
    ) {
        if (instance.state.child) {
            Topic.deleteInstance(context, instance.state.child);
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

export interface TopicWithChildArrayState {
    children: string[];
}

export abstract class TopicWithChildArray <
    InitArgs extends {} = {},
    State extends TopicWithChildArrayState = TopicWithChildArrayState,
    ReturnArgs extends {} = {},
> extends Topic<InitArgs, State, ReturnArgs> {
    async removeChild (
        context: BotContext,
        instance: TopicInstance<State>,
        childInstance: TopicInstance
    ) {
        Topic.deleteInstance(context, childInstance.state.child);
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
