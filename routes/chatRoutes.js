const express = require('express');
const router = express.Router();
const { getMessages, sendMessage } = require('../controllers/chatController');

router.get('/messages', getMessages);
router.post('/messages', sendMessage);

module.exports = router;
