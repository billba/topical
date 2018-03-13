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
        
class ChildTopicClass extends TopicClass {
    async init(context, instance, args) {
        context.reply(`Welcome to the child topic!\nWhat multiple of ${args["foo"]} do you want to return?`);
    }

    async onReceive(context, instance) {
        const text = context.request.type === 'message' ? context.request.text : undefined;
        
        const num = Number.parseInt(text);

        if (Number.isNaN(num))
            context.reply(`Please supply a number.`);
        else
            this.returnToParent(instance, {
                num
            });
    }
}

const childTopicClass = new TopicClass('childTopic');

class RootTopicClass extends TopicClass {
    async init(context) {
        context.reply(`Welcome to my root topic!`);
    }
    
    async onReceive(context, instance) {
        const text = context.request.type === 'message' ? context.request.text : undefined;

        if (text === 'end child') {
            if (instance.state.child) {
                instance.state.child = undefined;
                context.reply(`I have ended the child topic.`);
            } else {
                context.reply(`There is no child to end`);
            }
            return;
        }

        if (await this.dispatch(context, instance.state.child))
            return;

        if (text === 'start child') {
            topicContext.instance.state.child = await childTopicClass.createInstance(context, instance, {
                foo: 13
            });
            return;
        }

        context.reply(`Try "start child" or "end child".`);
    }

    async onChildReturn(context, instance, childInstance) {
        context.reply(`13 * ${childInstance.returnArgs.num} = ${13 * childInstance.returnArgs.num}`);
        instance.state.child = undefined;
    }
}

const rootTopicClass = new TopicClass('rootTopic')
