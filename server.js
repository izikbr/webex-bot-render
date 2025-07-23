const express = require('express');
const axios = require('axios');

class SimpleWebexBot {
    constructor() {
        this.accessToken = process.env.WEBEX_TOKEN || 'NDA1NjEzNTItZWE1ZS00NWUyLTkzMzUtODUwYTcwYmRjMjI5N2M4Njk3YjEtZjhi_PE93_12fb453b-0239-438f-aa06-4aa2b2654b5a';
        this.baseURL = 'https://webexapis.com/v1';
        this.botInfo = null;
        this.processedMessages = new Set();
        this.isRunning = false;
        
        this.headers = {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
        };
        
        this.logs = [];
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, message, type };
        this.logs.push(logEntry);
        
        if (this.logs.length > 100) {
            this.logs = this.logs.slice(-100);
        }
        
        console.log(`[${timestamp}] ${message}`);
    }

    async initialize() {
        try {
            this.log('🚀 Starting Simple Webex Bot...');
            
            const response = await axios.get(`${this.baseURL}/people/me`, {
                headers: this.headers,
                timeout: 10000
            });
            
            this.botInfo = response.data;
            this.isRunning = true;
            
            this.log(`✅ Bot initialized: ${this.botInfo.displayName}`);
            this.log(`📧 Bot Email: ${this.botInfo.emails[0]}`);
            
            this.startChatMonitoring();
            
            return true;
            
        } catch (error) {
            this.log(`❌ Failed to initialize: ${error.message}`, 'error');
            return false;
        }
    }

    startChatMonitoring() {
        this.log('💬 Starting chat monitoring...');
        
        this.chatInterval = setInterval(async () => {
            if (this.isRunning) {
                await this.checkChatMessages();
            }
        }, 5000);
    }

    async checkChatMessages() {
        try {
            const response = await axios.get(`${this.baseURL}/messages?max=20`, {
                headers: this.headers,
                timeout: 8000
            });

            const messages = response.data.items;
            
            for (const message of messages.reverse()) {
                if (!this.processedMessages.has(message.id) && 
                    message.personId !== this.botInfo.id) {
                    
                    this.processedMessages.add(message.id);
                    await this.handleMessage(message);
                }
            }
            
            if (this.processedMessages.size > 200) {
                const oldMessages = Array.from(this.processedMessages).slice(0, 100);
                oldMessages.forEach(id => this.processedMessages.delete(id));
            }
            
        } catch (error) {
            if (!error.message.includes('timeout')) {
                this.log(`⚠️ Error checking messages: ${error.message}`, 'warning');
            }
        }
    }

    async handleMessage(message) {
        try {
            this.log(`📨 Message from ${message.personEmail}: ${message.text}`);
            
            if (this.shouldRespond(message.text)) {
                const response = this.generateResponse(message.text);
                await this.sendReply(message.roomId, response);
            }
            
        } catch (error) {
            this.log(`❌ Error handling message: ${error.message}`, 'error');
        }
    }

    shouldRespond(text) {
        if (!text) return false;
        
        const lowerText = text.toLowerCase();
        const triggers = [
            'בוט', 'עוזר', 'מה דעתך', 'שאלה', 'סיכום', 'עזרה',
            'bot', 'assistant', 'help', 'what do you think', 'question', 'summary'
        ];

        return triggers.some(trigger => lowerText.includes(trigger));
    }

    generateResponse(messageText) {
        const text = messageText.toLowerCase();
        
        if (text.includes('שלום') || text.includes('hello') || text.includes('hi')) {
            return 'שלום! 👋 אני בוט Webex, אשמח לעזור!';
        }
        
        if (text.includes('סיכום') || text.includes('summary')) {
            return 'אני יכול לעזור בסיכום! 📝 מה תרצו לסכם?';
        }
        
        if (text.includes('מה דעתך') || text.includes('what do you think')) {
            return 'זה נושא מעניין! 🤔 מה דעתם של אחרים?';
        }
        
        if (text.includes('עזרה') || text.includes('help')) {
            return 'אני כאן לעזור! 🙋‍♂️ תוכלו לשאול אותי על דברים שונים.';
        }
        
        const responses = [
            'שמעתי מה שאמרתם! 👂 מעניין...',
            'נקודה טובה! 💡 מה חושבים אחרים?',
            'אני רושם את זה בזיכרון 📋',
            'זה דורש דיון נוסף 💭',
            'אני מקשיב ולומד! 🤖'
        ];
        
        return responses[Math.floor(Math.random() * responses.length)];
    }

    async sendReply(roomId, text) {
        try {
            await axios.post(`${this.baseURL}/messages`, {
                roomId: roomId,
                text: text
            }, {
                headers: this.headers,
                timeout: 10000
            });
            
            this.log(`🤖 Bot replied: ${text.substring(0, 50)}...`);
            
        } catch (error) {
            this.log(`❌ Failed to send reply: ${error.message}`, 'error');
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            botInfo: this.botInfo,
            processedMessagesCount: this.processedMessages.size,
            uptime: process.uptime(),
            logs: this.logs.slice(-20)
        };
    }

    stop() {
        this.log('🛑 Stopping bot...');
        this.isRunning = false;
        
        if (this.chatInterval) {
            clearInterval(this.chatInterval);
        }
    }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const bot = new SimpleWebexBot();

app.get('/', (req, res) => {
    res.json({
        message: '🤖 Webex Bot is running!',
        status: 'active',
        timestamp: new Date().toISOString()
    });
});

app.get('/status', (req, res) => {
    res.json(bot.getStatus());
});

bot.initialize().then(success => {
    if (success) {
        console.log('✅ Bot initialized successfully');
    } else {
        console.error('❌ Failed to initialize bot');
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Server running on port ${PORT}`);
});

process.on('SIGTERM', () => {
    bot.stop();
    process.exit(0);
});

module.exports = { bot, app };