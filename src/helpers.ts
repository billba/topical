import { Promiseable, MiddlewareHandler, ConsoleAdapter, TurnContext, Activity, ConversationAccount } from "botbuilder";
import { TopicClass, Topic, Score, StartScore, DispatchScore, TopicWithContext, GetStartArgs, GetConstructorArgs } from "./topical";

export const toPromise = <T> (t: Promiseable<T>) => (t as any).then ? (t as Promise<T>) : Promise.resolve<T>(t);

export const prettyConsole: MiddlewareHandler = (context, next) => {
    context.onSendActivities((_, activities, next) => {
        let first;

        for (let activity of activities) {
            if (activity.type === 'message') {
                activity.text = '> '
                    + activity.text!
                        .split('\n')
                        .join(`\n> `)
                    + '\n';

                if (!first) {
                    activity.text = '\n' + activity.text;
                    first = activity;
                }
            }
        }

        return next();
    });

    return next();
}

export const returnsPromiseVoid = () => Promise.resolve();

export const consoleOnTurn = async (
    adapter: ConsoleAdapter,
    handler: (context: TurnContext) => Promise<void>
 ) => {
    const conversationUpdate: Partial<Activity> = {
        type: 'conversationUpdate',
        channelId: 'console',
        from: { id: 'user', name: 'User1', role: 'role' },
        conversation:  { id: 'convo1', name:'', isGroup: false, conversationType: 'conversation', role: 'bot' } as ConversationAccount,
        serviceUrl: '',
        recipient: {
            id: 'bot',
            name: 'bot',
            role: 'bot',
        },
    };

    await handler(new TurnContext(adapter, {
        ... conversationUpdate,
            membersAdded: [{
                id: 'bot',
                name: 'bot',
                role: 'bot',
            }],
    }));

    await handler(new TurnContext(adapter, {
        ... conversationUpdate,
            membersAdded: [{
                id: 'user',
                name: 'user',
                role: 'user,'
            }],
    }));

    adapter.listen(handler);
}

export const doTopic = async <
    Context extends TurnContext,
    TC extends TopicClass<any, TopicWithContext<Context>>,
> (
    topicClass: TC,
    context: Context,
    startArgs?: GetStartArgs<TC>,
    constructorArgs?: GetConstructorArgs<TC>,
) => {
    if (context.activity.type === 'conversationUpdate') {
        for (const member of context.activity.membersAdded!) {
            if (member.id === context.activity.recipient.id) {
                await (topicClass as any).start(context, startArgs, constructorArgs);
            }
        }
    }

    await (topicClass as any).dispatch(context);
}

export const startIfScore = async <
    T extends Topic,
> (
    topic: T,
    threshold = 0,
) => {
    const result = await topic.getStartScore();

    return result && result.score > threshold
        ? topic.start(result.startArgs)
        : false;
}

export const startBestScoringChild = async <
    T extends Topic,
> (
    topic: T,
) => {
    const results = (await Promise.all(Object
        .keys(topic.children)
        .map<Promise<[Topic, StartScore<any>]>>(child => {
            const childTopic = topic.loadChild(child);
            return childTopic
                .getStartScore()
                .then(result => [childTopic, result || { score: 0 }] as [Topic, StartScore<any>])
        })
    ))
    .filter(i => i[1].score > 0)
    .sort((a, b) => b[1].score - a[1].score);

    if (results.length) {
        await results[0][0]
            .start(results[0][1].startArgs);

        return true;
    }

    return false;
}

export interface Score <Start> {
    start?: StartScore<Start>;
    dispatch?: DispatchScore;
}

export const getScore = async <
    T extends Topic<Start>,
    Start = any,
> (
    topic: T,
): Promise<Score<Start> | void> => {
    const start = topic.started ? undefined : (await topic.getStartScore() || undefined);
    const dispatch = topic.started ? (await topic.getDispatchScore() || undefined) : undefined;

    if (start || dispatch)
        return {
            start,
            dispatch,
        }
}
