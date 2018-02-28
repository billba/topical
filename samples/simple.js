import { ConsoleAdapter } from 'botbuilder-node';
import { Bot, MemoryStorage, BotStateManager } from 'botbuilder';
import { TopicClass } from '../src/topical'; // from 'botbuilder-topical'

const adapter = new ConsoleAdapter();

adapter.listen();

const bot = new Bot(adapter);

bot
    .use(new MemoryStorage())
    .use(new BotStateManager())

bot.onReceive(async context => {
    await TopicClass.do(context, () => rootTopicClass.createInstance(context))
});
        
const childTopicClass = new TopicClass('childTopic')
    .init((context, topicContext) => {
        context.reply(`Welcome to the child topic!\nWhat multiple of ${topicContext.args["foo"]} do you want to return?`);
    })
    .onReceive((context, topicContext) => {
        const text = context.request.type === 'message' ? context.request.text : undefined;
        
        const num = Number.parseInt(text);

        if (Number.isNaN(num))
            context.reply(`Please supply a number.`);
        else
            topicContext.returnToParent({
                num
            });
    });

const rootTopicClass = new TopicClass('rootTopic')
    .init((context, topicContext) => {
        context.reply(`Welcome to my root topic!`);
    })
    .onReceive(async (context, topicContext) => {
        const text = context.request.type === 'message' ? context.request.text : undefined;

        if (text === 'end child') {
            if (topicContext.instance.state["child"]) {
                topicContext.instance.state["child"] = undefined;
                context.reply(`I have ended the child topic.`);
            } else {
                context.reply(`There is no child to end`);
            }
            return;
        }

        if (topicContext.instance.state["child"])
            return topicContext.dispatchToInstance(topicContext.instance.state["child"]);

        if (text === 'start child') {
            topicContext.instance.state["child"] = await topicContext.createTopicInstance(childTopicClass, {
                foo: 13
            });
            return;
        }

        context.reply(`Try "start child" or "end child".`);
    })
    .onChildReturn(childTopicClass, (context, topicContext) => {
        context.reply(`13 * ${topicContext.args["num"]} = ${13 * topicContext.args["num"]}`);
        topicContext.instance.state["child"]
    });