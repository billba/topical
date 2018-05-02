import { Promiseable, MiddlewareHandler, ConsoleAdapter, TurnContext, Activity, ConversationAccount } from "botbuilder";
import { Topicable, Topic, Score, StartScore, DispatchScore } from "./topical";

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
    T extends Topicable<Start, any, any, Constructor, Context>,
    Start,
    Constructor,
    Context extends TurnContext = TurnContext
> (
    topic: T,
    context: Context,
    startArgs?: Start,
    constructorArgs?: Constructor,
) => {
    if (context.activity.type === 'conversationUpdate') {
        for (const member of context.activity.membersAdded!) {
            if (member.id === context.activity.recipient.id) {
                await (topic as any).start(context, startArgs, constructorArgs);
            }
        }
    } else {
        await (topic as any).dispatch(context);
    }
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
    const results = (await Promise.all(topic
        .children
        .map(child => topic.loadTopic(child)
            .then(childTopic => childTopic
                .getStartScore()
                .then(result => ({
                    childTopic,
                    result: result || { score: 0}
                }))
            )
        )
    ))
    .filter(i => i.result.score > 0)
    .sort((a, b) => b.result.score - a.result.score);

    if (results.length) {
        await results[0]
            .childTopic
            .start(results[0].result.startArgs);

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