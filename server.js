const express = require('express');
const axios = require('axios');

// הגדרות שרת
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

class WebexBot {
    constructor() {
        // הטוקן מ-משתני סביבה או קבוע
        this.accessToken = process.env.WEBEX_TOKEN || 'NDA1NjEzNTItZWE1ZS00NWUyLTkzMzUtODUwYTcwYmRjMjI5N2M4Njk3YjEtZjhi_PE93_12fb453b-0239-438f-aa06-4aa2b2654b5a';
        this.baseURL = 'https://webexapis.com/v1';
        this.botInfo = null;
        this.processedMessages = new Set();
        this.isRunning = false;
        this.lastMessageTime = Date.now();
        
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
        
        // שמור רק 100 לוגים אחרונים
        if (this.logs.length > 100) {
            this.logs = this.logs.slice(-100);
        }
        
        console.log(`[${timestamp}] ${message}`);
    }

    async initialize() {
        try {
            this.log('🚀 Initializing Webex Bot...');
            
            const response = await axios.get(`${this.baseURL}/people/me`, {
                headers: this.headers,
                timeout: 10000
            });
            
            this.botInfo = response.data;
            this.isRunning = true;
            
            this.log(`✅ Bot initialized: ${this.botInfo.displayName}`);
            this.log(`📧 Bot Email: ${this.botInfo.emails[0]}`);
            
            // התחל האזנה
            this.startListening();
            
            return true;
            
        } catch (error) {
            this.log(`❌ Failed to initialize: ${error.message}`, 'error');
            return false;
        }
    }

    startListening() {
        this.log('👂 Starting to listen for messages...');
        
        // בדיקה כל 5 שניות
        this.messageInterval = setInterval(async () => {
            if (this.isRunning) {
                await this.checkMessages();
            }
        }, 5000);
        
        // בדיקת בריאות כל דקה
        this.healthInterval = setInterval(() => {
            this.log(`💓 Bot health check - Running: ${this.isRunning}`);
        }, 60000);
    }

    async checkMessages() {
        try {
            const response = await axios.get(`${this.baseURL}/messages?max=20`, {
                headers: this.headers,
                timeout: 8000
            });

            const messages = response.data.items;
            let newMessages = 0;
            
            for (const message of messages.reverse()) {
                if (!this.processedMessages.has(message.id) && 
                    message.personId !== this.botInfo.id) {
                    
                    this.processedMessages.add(message.id);
                    await this.handleMessage(message);
                    newMessages++;
                }
            }
            
            // עדכון זמן הודעה אחרונה
            if (newMessages > 0) {
                this.lastMessageTime = Date.now();
            }
            
            // ניקוי זיכרון
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
            this.log(`📨 New message from ${message.personEmail}: ${message.text}`);
            
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
            return 'שלום! 👋 אני הבוט של Webex, איך אוכל לעזור?';
        }
        
        if (text.includes('מה שלומך') || text.includes('how are you')) {
            return 'אני בוט ולכן תמיד בכושר מעולה! 🤖 איך אני יכול לעזור?';
        }
        
        if (text.includes('סיכום') || text.includes('summary')) {
            return 'אני יכול לעזור בסיכום דיונים! 📝 מה תרצו לסכם?';
        }
        
        if (text.includes('מה דעתך') || text.includes('what do you think')) {
            return 'זה נושא מעניין! 🤔 מה דעתם של שאר המשתתפים?';
        }
        
        if (text.includes('עזרה') || text.includes('help')) {
            return 'אני כאן לעזור! 🙋‍♂️ תוכלו לשאול אותי על סיכומים, דעות או כל דבר אחר.';
        }
        
        if (text.includes('תודה') || text.includes('thanks')) {
            return 'בכיף גדול! 😊 אני כאן בשבילכם.';
        }
        
        const responses = [
            'שמעתי מה שאמרתם! 👂 מעניין...',
            'נקודה טובה! 💡 מה חושבים אחרים?',
            'אני רושם את זה בזיכרון 📋',
            'זה נושא שדורש דיון נוסף 💭',
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
            
            this.log(`🤖 Bot replied: ${text}`);
            
        } catch (error) {
            this.log(`❌ Failed to send reply: ${error.message}`, 'error');
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            botInfo: this.botInfo,
            lastMessageTime: this.lastMessageTime,
            processedMessagesCount: this.processedMessages.size,
            uptime: process.uptime(),
            logs: this.logs.slice(-20) // 20 לוגים אחרונים
        };
    }

    stop() {
        this.log('🛑 Stopping bot...');
        this.isRunning = false;
        
        if (this.messageInterval) {
            clearInterval(this.messageInterval);
        }
        if (this.healthInterval) {
            clearInterval(this.healthInterval);
        }
    }
}

// יצירת מופע הבוט
const bot = new WebexBot();

// נתיבי API
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

app.get('/health', (req, res) => {
    const status = bot.getStatus();
    res.status(status.isRunning ? 200 : 503).json({
        healthy: status.isRunning,
        uptime: status.uptime,
        lastActivity: status.lastMessageTime
    });
});

app.post('/restart', (req, res) => {
    bot.log('🔄 Restart requested via API');
    bot.stop();
    setTimeout(() => {
        bot.initialize();
    }, 2000);
    res.json({ message: 'Bot restart initiated' });
});

// אתחול הבוט
bot.initialize().then(success => {
    if (success) {
        console.log('✅ Webex Bot initialized successfully');
    } else {
        console.error('❌ Failed to initialize bot');
    }
});

// הפעלת השרת
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Server running on port ${PORT}`);
    console.log(`📊 Status: http://localhost:${PORT}/status`);
    console.log(`💓 Health: http://localhost:${PORT}/health`);
});

// טיפול בסגירה נקייה
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    bot.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    bot.stop();
    process.exit(0);
});

module.exports = { bot, app };