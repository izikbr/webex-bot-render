const express = require('express');
const axios = require('axios');

class WebexBot {
    constructor() {
        this.accessToken = process.env.WEBEX_TOKEN || 'NDA1NjEzNTItZWE1ZS00NWUyLTkzMzUtODUwYTcwYmRjMjI5N2M4Njk3YjEtZjhi_PE93_12fb453b-0239-438f-aa06-4aa2b2654b5a';
        this.baseURL = 'https://webexapis.com/v1';
        this.botInfo = null;
        this.processedMessages = new Set();
        this.isRunning = false;
        this.lastSuccessfulCheck = null;
        
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
            this.log('🚀 Starting Webex Bot...');
            
            const response = await axios.get(`${this.baseURL}/people/me`, {
                headers: this.headers,
                timeout: 10000
            });
            
            this.botInfo = response.data;
            this.isRunning = true;
            
            this.log(`✅ Bot initialized: ${this.botInfo.displayName}`);
            this.log(`📧 Bot Email: ${this.botInfo.emails[0]}`);
            this.log(`🎯 Bot is ready to respond in chat rooms!`);
            
            // התחל עם ניטור מתון יותר
            this.startSafeMonitoring();
            
            return true;
            
        } catch (error) {
            this.log(`❌ Failed to initialize: ${error.message}`, 'error');
            return false;
        }
    }

    startSafeMonitoring() {
        this.log('💬 Starting safe chat monitoring...');
        
        // בדיקה כל 10 שניות במקום 5 (פחות לחץ על API)
        this.chatInterval = setInterval(async () => {
            if (this.isRunning) {
                await this.checkMessagesCarefully();
            }
        }, 10000);

        // הודעת חיים כל דקה
        this.heartbeatInterval = setInterval(() => {
            this.log(`💓 Bot heartbeat - Status: ${this.isRunning ? 'Active' : 'Inactive'}`);
        }, 60000);
    }

    async checkMessagesCarefully() {
        try {
            // נסה עם פרמטרים מוגבלים יותר
            const response = await axios.get(`${this.baseURL}/messages?max=5&mentionedPeople=me`, {
                headers: this.headers,
                timeout: 8000
            });

            this.lastSuccessfulCheck = new Date();
            const messages = response.data.items || [];
            
            this.log(`📨 Found ${messages.length} relevant messages`);
            
            for (const message of messages.reverse()) {
                if (!this.processedMessages.has(message.id) && 
                    message.personId !== this.botInfo.id) {
                    
                    this.processedMessages.add(message.id);
                    await this.handleMessage(message);
                }
            }
            
            // ניקוי זיכרון
            if (this.processedMessages.size > 50) {
                const oldMessages = Array.from(this.processedMessages).slice(0, 25);
                oldMessages.forEach(id => this.processedMessages.delete(id));
            }
            
        } catch (error) {
            if (error.response?.status === 400) {
                // אל תציג שגיאות 400 כל הזמן
                if (!this.lastSuccessfulCheck || (Date.now() - this.lastSuccessfulCheck.getTime()) > 300000) {
                    this.log(`⚠️ API access limited - bot works in direct messages only`, 'warning');
                }
            } else if (error.response?.status === 429) {
                this.log(`⏰ Rate limited - slowing down...`, 'warning');
                // האט לדקה במקום 10 שניות
                clearInterval(this.chatInterval);
                setTimeout(() => {
                    this.startSafeMonitoring();
                }, 60000);
            } else if (!error.message.includes('timeout')) {
                this.log(`⚠️ Error: ${error.message}`, 'warning');
            }
        }
    }

    async handleMessage(message) {
        try {
            this.log(`📨 Processing message from ${message.personEmail}`);
            this.log(`📝 Content: ${message.text}`);
            
            if (this.shouldRespond(message.text)) {
                const response = this.generateResponse(message.text, message.personEmail);
                await this.sendReply(message.roomId, response);
            } else {
                this.log(`👂 Listening but no trigger words found`);
            }
            
        } catch (error) {
            this.log(`❌ Error handling message: ${error.message}`, 'error');
        }
    }

    shouldRespond(text) {
        if (!text) return false;
        
        const lowerText = text.toLowerCase();
        const triggers = [
            // עברית - מילות הפעלה
            'בוט', 'עוזר', 'מה דעתך', 'שאלה', 'סיכום', 'עזרה', 'היי',
            // אנגלית - מילות הפעלה  
            'bot', 'assistant', 'help', 'what do you think', 'question', 'summary', 'hey'
        ];

        const found = triggers.some(trigger => lowerText.includes(trigger));
        this.log(`🎯 Trigger check: ${found ? 'FOUND' : 'not found'} in "${text.substring(0, 30)}..."`);
        
        return found;
    }

    generateResponse(messageText, senderEmail) {
        const text = messageText.toLowerCase();
        const firstName = senderEmail.split('@')[0];
        
        if (text.includes('שלום') || text.includes('hello') || text.includes('hi') || text.includes('היי')) {
            return `שלום ${firstName}! 👋\n\nאני בוט Webex חכם ואשמח לעזור!\n\n🤖 **מה אני יכול לעשות:**\n• לענות על שאלות\n• לעזור בסיכומים\n• לתת דעות על נושאים\n• לספק עזרה כללית\n\n💬 פשוט תזכיר אותי במילה "בוט" או "עוזר"!`;
        }
        
        if (text.includes('מה שלומך') || text.includes('how are you')) {
            return `שלום ${firstName}! 🤖\n\n✅ **הסטטוס שלי מעולה:**\n• מערכות פעילות\n• מחובר לWebex\n• מוכן לעזור!\n\n💡 איך אני יכול לעזור לך היום?`;
        }
        
        if (text.includes('סיכום') || text.includes('summary')) {
            return `📝 **סיכום - זה המומחיות שלי!**\n\nשלח לי את המידע שתרצה לסכם ואני:\n• ✏️ אארגן את הנקודות העיקריות\n• 🎯 אבליט את הדברים החשובים\n• 📋 אכין רשימת פעולות למעקב\n\nמה תרצה לסכם, ${firstName}?`;
        }
        
        if (text.includes('מה דעתך') || text.includes('what do you think')) {
            return `🤔 **שאלה מעניינת!**\n\n${firstName}, אני אשמח לתת את דעתי!\nאבל קודם - ספר לי יותר פרטים על הנושא.\n\n💭 כדי שאוכל לתת תשובה טובה, אני צריך להבין:\n• מה בדיוק מעניין אותך?\n• איזה היבטים חשובים לך?\n• יש רקע מסוים שכדאי שאדע?`;
        }
        
        if (text.includes('עזרה') || text.includes('help')) {
            return `🆘 **מדריך העזרה שלי:**\n\n${firstName}, אני כאן בשבילך! 💪\n\n🎯 **איך לקבל עזרה:**\n• תזכיר אותי במילה "בוט" או "עוזר"\n• שאל שאלות ישירות\n• בקש סיכומים\n• שתף דעות ורעיונות\n\n💡 **דוגמאות:**\n• "בוט, תוכל לסכם את הפגישה?"\n• "עוזר, מה דעתך על הרעיון הזה?"\n• "בוט, אני צריך עזרה עם..."\n\nמה תרצה לעשות?`;
        }
        
        if (text.includes('תודה') || text.includes('thanks') || text.includes('thank you')) {
            return `😊 **בכיף גדול ${firstName}!**\n\nזה בדיוק בשביל זה אני כאן! 🤖\n\n✨ תמיד אשמח לעזור\n💬 רק תזכיר אותי כשתצטרך\n🚀 אני זמין 24/7!\n\nיום נהדר! 🌟`;
        }
        
        // תגובות כלליות עם אישיות
        const responses = [
            `💡 מעניין מה שאמרת ${firstName}!\n\nיש לי כמה מחשבות על זה... מה אחרים חושבים?`,
            
            `👂 שמעתי אותך ${firstName}!\n\nזה נושא שדורש דיון נוסף. בואו נעמיק בזה!`,
            
            `📋 רושם את זה בזיכרון שלי!\n\n${firstName}, זה יכול להיות חשוב לסיכום. ספר עוד!`,
            
            `🎯 נקודה טובה ${firstName}!\n\nמה השלב הבא? איך נמשיך הלאה עם זה?`,
            
            `🤖 אני מקשיב ולומד ${firstName}!\n\nהנושא הזה מרתק אותי. יש לך עוד תובנות?`
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
            
            this.log(`🤖 ✅ Response sent successfully`);
            this.log(`📤 Preview: ${text.substring(0, 50)}...`);
            
        } catch (error) {
            this.log(`❌ Failed to send reply: ${error.message}`, 'error');
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            botInfo: this.botInfo,
            processedMessagesCount: this.processedMessages.size,
            lastSuccessfulCheck: this.lastSuccessfulCheck,
            uptime: process.uptime(),
            logs: this.logs.slice(-20),
            features: [
                'Smart chat responses',
                'Personalized interactions', 
                'Summary assistance',
                'Question answering',
                'Gentle API usage'
            ]
        };
    }

    async getMyRooms() {
        try {
            const response = await axios.get(`${this.baseURL}/rooms?type=group`, {
                headers: this.headers
            });
            
            return response.data.items || [];
        } catch (error) {
            this.log(`⚠️ Could not fetch rooms: ${error.message}`, 'warning');
            return [];
        }
    }

    stop() {
        this.log('🛑 Stopping bot gracefully...');
        this.isRunning = false;
        
        if (this.chatInterval) {
            clearInterval(this.chatInterval);
        }
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.log('✅ Bot stopped cleanly');
    }
}

// Express Application
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const bot = new WebexBot();

// Routes
app.get('/', (req, res) => {
    res.json({
        message: '🤖 Smart Webex Bot is running!',
        description: 'Intelligent chat bot with personality',
        status: 'active',
        timestamp: new Date().toISOString(),
        features: [
            'Natural conversations',
            'Personalized responses',
            'Summary assistance', 
            'Smart triggers',
            'Gentle API usage'
        ]
    });
});

app.get('/status', (req, res) => {
    res.json(bot.getStatus());
});

app.get('/rooms', async (req, res) => {
    const rooms = await bot.getMyRooms();
    res.json({
        count: rooms.length,
        rooms: rooms.map(r => ({
            id: r.id,
            title: r.title,
            type: r.type
        }))
    });
});

app.get('/health', (req, res) => {
    const status = bot.getStatus();
    res.status(status.isRunning ? 200 : 503).json({
        healthy: status.isRunning,
        uptime: status.uptime,
        lastCheck: status.lastSuccessfulCheck
    });
});

// Test message endpoint
app.post('/test-message', async (req, res) => {
    const { roomId, message } = req.body;
    
    if (!roomId || !message) {
        return res.status(400).json({ error: 'roomId and message required' });
    }
    
    try {
        await bot.sendReply(roomId, message);
        res.json({ success: true, message: 'Test message sent' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Initialize bot
bot.initialize().then(success => {
    if (success) {
        console.log('✅ Smart Webex Bot initialized successfully');
    } else {
        console.error('❌ Failed to initialize bot');
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Smart Webex Bot Server running on port ${PORT}`);
    console.log(`📊 Status: http://localhost:${PORT}/status`);
    console.log(`🏥 Health: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received');
    bot.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received');
    bot.stop();
    process.exit(0);
});

module.exports = { bot, app };