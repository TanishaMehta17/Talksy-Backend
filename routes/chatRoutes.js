const express = require('express');
const router = express.Router();
const { getMessages, sendMessage ,
editMessage,
deleteMessage,
getRecentMessages,
getChatUsers,
markMessagesAsRead,
getUnreadCount, } = require('../controllers/chatController');

router.get('/messages', getMessages);
router.post('/messages', sendMessage);
router.get('/chat-users', getChatUsers);
router.get('/recent-messages', getRecentMessages);
router.post('/mark-messages-as-read', markMessagesAsRead);
router.get('/unread-count', getUnreadCount);
router.post('/edit-message', editMessage);
router.post('/delete-message', deleteMessage);
module.exports = router;
