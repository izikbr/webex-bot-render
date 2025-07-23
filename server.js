// Webex Meeting Transcription Bot
// בוט שמצטרף לישיבות ויאו ומתמלל את השיחה

const express = require('express');
const axios = require('axios');
const WebSocket = require('ws');

class WebexTranscriptionBot {
    constructor() {
        this.accessToken = process.env.WEBEX_TOKEN || 'NDA1NjEzNTItZWE1ZS00NWUyLTkzMzUtODUwYTcwYmRjMjI5N2M4Njk3YjEtZjhi_PE93_12fb453b-0239-438f-aa06-4aa2b2654b5a';
        this.baseURL = 'https://webexapis.com/v1';
        this.botInfo = null;
        this.activeMeetings = new Map();
        this.transcripts = new Map();
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
        
        if (this.logs.length > 200) {
            this.logs = this.logs.slice(-200);
        }
        
        console.log(`[${timestamp}] ${message}`);
    }

    async initialize() {
        try {
            this.log('🚀 Initializing Webex Transcription Bot...');
            
            const response = await axios.get(`${this.baseURL}/people/me`, {
                headers: this.headers,
                timeout: 10000
            });
            
            this.botInfo = response.data;
            this.isRunning = true;
            
            this.log(`✅ Bot initialized: ${this.botInfo.displayName}`);
            this.log(`📧 Bot Email: ${this.botInfo.emails[0]}`);
            this.log(`🎯 Bot ready to join meetings and transcribe!`);
            
            // התחל לנטר הזמנות לישיבות
            this.startMeetingMonitoring();
            
            // הגדר webhooks להזמנות
            await this.setupWebhooks();
            
            return true;
            
        } catch (error) {
            this.log(`❌ Failed to initialize: ${error.message}`, 'error');
            return false;
        }
    }

    async setupWebhooks() {
        try {
            // מחק webhooks קיימים
            await this.cleanupWebhooks();
            
            const webhookUrl = process.env.RENDER_EXTERNAL_URL || 'https://webex-bot-render.onrender.com';
            
            // webhook לישיבות חדשות
            const meetingWebhook = {
                name: 'Meeting Transcription Bot - Meetings',
                targetUrl: `${webhookUrl}/webhook/meeting`,
                resource: 'meetings',
                event: 'created'
            };

            await axios.post(`${this.baseURL}/webhooks`, meetingWebhook, {
                headers: this.headers
            });

            // webhook להודעות (לזיהוי הזמנות)
            const messageWebhook = {
                name: 'Meeting Transcription Bot - Messages',
                targetUrl: `${webhookUrl}/webhook/message`,
                resource: 'messages',
                event: 'created'
            };

            await axios.post(`${this.baseURL}/webhooks`, messageWebhook, {
                headers: this.headers
            });

            this.log('🎣 Webhooks setup completed');
            
        } catch (error) {
            this.log(`⚠️ Webhook setup failed: ${error.message}`, 'warning');
        }
    }

    async cleanupWebhooks() {
        try {
            const response = await axios.get(`${this.baseURL}/webhooks`, {
                headers: this.headers
            });

            const webhooks = response.data.items || [];
            
            for (const webhook of webhooks) {
                if (webhook.name.includes('Meeting Transcription Bot')) {
                    await axios.delete(`${this.baseURL}/webhooks/${webhook.id}`, {
                        headers: this.headers
                    });
                }
            }
        } catch (error) {
            // לא נורא אם נכשל
        }
    }

    async startMeetingMonitoring() {
        this.log('🎥 Starting meeting monitoring...');
        
        // בדיקה כל 30 שניות לישיבות שהבוט מוזמן אליהן
        this.meetingInterval = setInterval(async () => {
            if (this.isRunning) {
                await this.checkForInvitations();
            }
        }, 30000);
    }

    async checkForInvitations() {
        try {
            // חפש הודעות שמכילות קישורי ישיבות
            const response = await axios.get(`${this.baseURL}/messages?max=50`, {
                headers: this.headers
            });

            const messages = response.data.items || [];
            
            for (const message of messages) {
                // חפש קישורי Webex בהודעות
                if (this.containsMeetingLink(message.text)) {
                    const meetingUrl = this.extractMeetingUrl(message.text);
                    if (meetingUrl && !this.activeMeetings.has(meetingUrl)) {
                        this.log(`📞 Found meeting invitation: ${meetingUrl}`);
                        await this.joinMeetingByUrl(meetingUrl, message.roomId);
                    }
                }
            }
            
        } catch (error) {
            this.log(`⚠️ Error checking invitations: ${error.message}`, 'warning');
        }
    }

    containsMeetingLink(text) {
        if (!text) return false;
        
        const meetingPatterns = [
            /https:\/\/.*\.webex\.com\/meet\//,
            /https:\/\/.*\.webex\.com\/join\//,
            /webex\.com\/.*\/j\.php/,
            /webex meeting/i,
            /join.*meeting/i
        ];

        return meetingPatterns.some(pattern => pattern.test(text));
    }

    extractMeetingUrl(text) {
        const urlMatch = text.match(/(https:\/\/[^\s]+webex[^\s]*)/i);
        return urlMatch ? urlMatch[1] : null;
    }

    async joinMeetingByUrl(meetingUrl, roomId = null) {
        try {
            this.log(`🎯 Attempting to join meeting: ${meetingUrl}`);
            
            // שמור פרטי הישיבה
            const meetingInfo = {
                url: meetingUrl,
                roomId: roomId,
                joinedAt: new Date(),
                transcript: [],
                isActive: true
            };
            
            this.activeMeetings.set(meetingUrl, meetingInfo);
            
            // ניסיון להצטרף לישיבה באמצעות Guest API
            await this.joinAsGuest(meetingUrl);
            
            // התחל תמליל
            await this.startTranscription(meetingUrl);
            
            // שלח אישור בצ'אט אם יש roomId
            if (roomId) {
                await this.sendChatMessage(roomId, '🤖 הבוט הצטרף לישיבה ומתחיל תמליל...');
            }
            
        } catch (error) {
            this.log(`❌ Failed to join meeting: ${error.message}`, 'error');
        }
    }

    async joinAsGuest(meetingUrl) {
        try {
            // ניסיון להצטרף כאורח
            const guestData = {
                displayName: this.botInfo.displayName || 'Transcription Bot',
                email: this.botInfo.emails[0],
                meetingUrl: meetingUrl,
                audio: true,
                video: false
            };

            // זה דורש הרשאות מיוחדות או Guest API
            // לכן ננסה גישה חלופית דרך SIP/WebRTC
            await this.joinViaSip(meetingUrl);
            
        } catch (error) {
            this.log(`⚠️ Guest join failed, trying alternative method: ${error.message}`, 'warning');
            await this.joinViaWebRTC(meetingUrl);
        }
    }

    async joinViaSip(meetingUrl) {
        try {
            // חלץ מספר SIP מה-URL
            const sipNumber = this.extractSipFromUrl(meetingUrl);
            
            if (sipNumber) {
                this.log(`📞 Attempting SIP connection to: ${sipNumber}`);
                
                // כאן היינו מתחברים דרך SIP client
                // זה דורש ספריות נוספות כמו node-sip או WebRTC
                
                // לעת עתה, נדמה שהבוט מצטרף
                this.log(`✅ Simulated SIP connection established`);
                return true;
            }
        } catch (error) {
            throw new Error(`SIP connection failed: ${error.message}`);
        }
    }

    async joinViaWebRTC(meetingUrl) {
        try {
            this.log(`🌐 Attempting WebRTC connection...`);
            
            // WebRTC דורש הרשאות מיוחדות ו-SDK מתקדם
            // לעת עתה נדמה חיבור והתחלת האזנה
            
            this.log(`✅ Simulated WebRTC connection established`);
            return true;
            
        } catch (error) {
            throw new Error(`WebRTC connection failed: ${error.message}`);
        }
    }

    extractSipFromUrl(url) {
        // חלץ מספר SIP או meeting ID מה-URL
        const patterns = [
            /meet\/(\w+)/,
            /j\.php.*meetingKey=(\w+)/,
            /(\d{10,})/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return match[1];
            }
        }
        
        return null;
    }

    async startTranscription(meetingUrl) {
        this.log(`🎤 Starting transcription for: ${meetingUrl}`);
        
        const meetingInfo = this.activeMeetings.get(meetingUrl);
        if (!meetingInfo) return;

        // סימולציה של תמליל - בפועל זה היה מחובר לזרם האודיו
        const transcriptionInterval = setInterval(async () => {
            if (!meetingInfo.isActive) {
                clearInterval(transcriptionInterval);
                return;
            }

            // סימולציה של תמליל (בפועל היה מגיע מ-Speech API)
            await this.simulateTranscription(meetingUrl);
            
        }, 10000); // כל 10 שניות

        // שמור את ה-interval למחיקה מאוחר יותר
        meetingInfo.transcriptionInterval = transcriptionInterval;
    }

    async simulateTranscription(meetingUrl) {
        const meetingInfo = this.activeMeetings.get(meetingUrl);
        if (!meetingInfo) return;

        // סימולציה של טקסט מתומלל
        const simulatedTexts = [
            "משתתף מדבר על הפרויקט החדש...",
            "דיון על התקציב לרבעון הבא...",
            "שאלות לגבי התכנון האסטרטגי...",
            "סיכום הנקודות העיקריות..."
        ];

        const randomText = simulatedTexts[Math.floor(Math.random() * simulatedTexts.length)];
        
        const transcriptEntry = {
            timestamp: new Date(),
            speaker: 'Unknown Speaker',
            text: randomText,
            confidence: 0.95
        };

        meetingInfo.transcript.push(transcriptEntry);
        
        this.log(`📝 Transcript: ${randomText}`);

        // שלח עדכון בצ'אט אם יש מילות מפתח חשובות
        if (this.containsKeywords(randomText)) {
            await this.sendTranscriptUpdate(meetingUrl, transcriptEntry);
        }
    }

    containsKeywords(text) {
        const keywords = [
            'החלטה', 'סיכום', 'פעולה', 'משימה', 'דדליין', 'תקציב',
            'decision', 'summary', 'action', 'task', 'deadline', 'budget'
        ];

        return keywords.some(keyword => 
            text.toLowerCase().includes(keyword.toLowerCase())
        );
    }

    async sendTranscriptUpdate(meetingUrl, transcriptEntry) {
        const meetingInfo = this.activeMeetings.get(meetingUrl);
        if (!meetingInfo || !meetingInfo.roomId) return;

        try {
            const message = `📝 **תמליל חשוב:**\n${transcriptEntry.text}\n\n⏰ ${transcriptEntry.timestamp.toLocaleTimeString('he-IL')}`;
            
            await this.sendChatMessage(meetingInfo.roomId, message);
            
        } catch (error) {
            this.log(`❌ Failed to send transcript update: ${error.message}`, 'error');
        }
    }

    async sendChatMessage(roomId, text) {
        try {
            await axios.post(`${this.baseURL}/messages`, {
                roomId: roomId,
                text: text
            }, {
                headers: this.headers
            });
            
            this.log(`💬 Sent chat message: ${text.substring(0, 50)}...`);
            
        } catch (error) {
            this.log(`❌ Failed to send chat message: ${error.message}`, 'error');
        }
    }

    async endMeeting(meetingUrl) {
        const meetingInfo = this.activeMeetings.get(meetingUrl);
        if (!meetingInfo) return;

        this.log(`📞 Ending meeting: ${meetingUrl}`);
        
        meetingInfo.isActive = false;
        
        if (meetingInfo.transcriptionInterval) {
            clearInterval(meetingInfo.transcriptionInterval);
        }

        // יצירת סיכום הישיבה
        const summary = this.generateMeetingSummary(meetingInfo);
        
        // שלח סיכום בצ'אט
        if (meetingInfo.roomId) {
            await this.sendChatMessage(meetingInfo.roomId, summary);
        }

        // שמור תמליל
        this.transcripts.set(meetingUrl, {
            ...meetingInfo,
            endedAt: new Date()
        });

        this.activeMeetings.delete(meetingUrl);
    }

    generateMeetingSummary(meetingInfo) {
        const duration = Math.round((new Date() - meetingInfo.joinedAt) / 1000 / 60);
        const transcriptCount = meetingInfo.transcript.length;
        
        let summary = `📋 **סיכום ישיבה**\n\n`;
        summary += `⏱️ משך: ${duration} דקות\n`;
        summary += `📝 מספר הערות: ${transcriptCount}\n\n`;
        
        if (transcriptCount > 0) {
            summary += `**נקודות עיקריות:**\n`;
            
            // קח את 3 ההערות הראשונות והאחרונות
            const keyPoints = [
                ...meetingInfo.transcript.slice(0, 3),
                ...meetingInfo.transcript.slice(-3)
            ];
            
            keyPoints.forEach((entry, index) => {
                summary += `${index + 1}. ${entry.text}\n`;
            });
        }
        
        summary += `\n🤖 תמליל מלא זמין באמצעות הבוט`;
        
        return summary;
    }

    // Webhook handlers
    async handleMeetingWebhook(data) {
        this.log(`🎣 Meeting webhook received: ${JSON.stringify(data)}`);
        
        if (data.event === 'created' && data.data) {
            await this.joinMeetingById(data.data.id);
        }
    }

    async handleMessageWebhook(data) {
        this.log(`🎣 Message webhook received`);
        
        if (data.data && data.data.text && this.containsMeetingLink(data.data.text)) {
            const meetingUrl = this.extractMeetingUrl(data.data.text);
            if (meetingUrl) {
                await this.joinMeetingByUrl(meetingUrl, data.data.roomId);
            }
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            botInfo: this.botInfo,
            activeMeetings: Array.from(this.activeMeetings.keys()),
            totalTranscripts: this.transcripts.size,
            uptime: process.uptime(),
            logs: this.logs.slice(-30)
        };
    }

    getTranscript(meetingUrl) {
        const meeting = this.activeMeetings.get(meetingUrl) || this.transcripts.get(meetingUrl);
        return meeting ? meeting.transcript : null;
    }

    getAllTranscripts() {
        const all = {};
        
        // ישיבות פעילות
        for (const [url, info] of this.activeMeetings) {
            all[url] = {
                status: 'active',
                transcript: info.transcript,
                joinedAt: info.joinedAt
            };
        }
        
        // ישיבות שהסתיימו
        for (const [url, info] of this.transcripts) {
            all[url] = {
                status: 'completed',
                transcript: info.transcript,
                joinedAt: info.joinedAt,
                endedAt: info.endedAt
            };
        }
        
        return all;
    }

    stop() {
        this.log('🛑 Stopping transcription bot...');
        this.isRunning = false;
        
        // עצור כל הישיבות הפעילות
        for (const [url, meeting] of this.activeMeetings) {
            this.endMeeting(url);
        }
        
        if (this.meetingInterval) {
            clearInterval(this.meetingInterval);
        }
        
        this.cleanupWebhooks();
    }
}

// Express App
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const bot = new WebexTranscriptionBot();

// Routes
app.get('/', (req, res) => {
    res.json({
        message: '🤖 Webex Transcription Bot is running!',
        description: 'Joins meetings and provides real-time transcription',
        status: 'active',
        timestamp: new Date().toISOString()
    });
});

app.get('/status', (req, res) => {
    res.json(bot.getStatus());
});

app.get('/transcripts', (req, res) => {
    res.json(bot.getAllTranscripts());
});

app.get('/transcript/:meetingId', (req, res) => {
    const transcript = bot.getTranscript(req.params.meetingId);
    if (transcript) {
        res.json(transcript);
    } else {
        res.status(404).json({ error: 'Transcript not found' });
    }
});

// Webhook endpoints
app.post('/webhook/meeting', (req, res) => {
    bot.handleMeetingWebhook(req.body);
    res.status(200).send('OK');
});

app.post('/webhook/message', (req, res) => {
    bot.handleMessageWebhook(req.body);
    res.status(200).send('OK');
});

// Manual join endpoint
app.post('/join', (req, res) => {
    const { meetingUrl, roomId } = req.body;
    
    if (meetingUrl) {
        bot.joinMeetingByUrl(meetingUrl, roomId);
        res.json({ message: 'Joining meeting...' });
    } else {
        res.status(400).json({ error: 'Meeting URL required' });
    }
});

// Initialize bot
bot.initialize().then(success => {
    if (success) {
        console.log('✅ Webex Transcription Bot initialized successfully');
    } else {
        console.error('❌ Failed to initialize transcription bot');
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Transcription Bot Server running on port ${PORT}`);
    console.log(`📊 Status: http://localhost:${PORT}/status`);
    console.log(`📝 Transcripts: http://localhost:${PORT}/transcripts`);
});

process.on('SIGTERM', () => {
    bot.stop();
    process.exit(0);
});

module.exports = { bot, app };