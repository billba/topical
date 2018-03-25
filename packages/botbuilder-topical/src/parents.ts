import { Topic, TopicInstance } from './topical';
import { BotContext } from 'botbuilder';

export interface TopicWithChildState {
    child: string;
}

export abstract class TopicWithChild <
    InitArgs extends {} = {},
    State extends TopicWithChildState = TopicWithChildState,
    ReturnArgs extends {} = {},
    Context extends BotContext = BotContext, 
> extends Topic<InitArgs, State, ReturnArgs, Context> {
    clearChild (
        context: Context,
        instance: TopicInstance<State>,
    ) {
        if (instance.state.child) {
            Topic.deleteInstance(context, instance.state.child);
            instance.state.child = undefined;
        }
    }

    setChild (
        context: Context,
        instance: TopicInstance<State>,
        childInstanceName: string,
    ) {
        if (instance.state.child)
            this.clearChild(context, instance);
        instance.state.child = childInstanceName;
    }

    hasChild (
        context: Context,
        instance: TopicInstance<State>,
    ) {
        return !!instance.state.child;
    }

    async dispatchToChild (
        context: Context,
        instance: TopicInstance<State>,
    ) {
        return this.dispatch(context, instance.state.child);
    }

    listChildren (
        context: Context,
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
    Context extends BotContext = BotContext,
> extends Topic<InitArgs, State, ReturnArgs, Context> {
    async removeChild (
        context: Context,
        instance: TopicInstance<State>,
        childInstance: TopicInstance
    ) {
        Topic.deleteInstance(context, childInstance.state.child);
        instance.state.children = instance.state.children.filter(child => child !== childInstance.name);
    }

    async init (
        context: Context,
        instance: TopicInstance<State>,
    ) {
        instance.state.children = [];
    }

    listChildren (
        context: Context,
        instance: TopicInstance<State>,
    ) {
        return instance.state.children;
    }
}
