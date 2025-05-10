const express = require('express');
const router = express.Router();
const { signup, login, profile ,TokenisValid , getdata } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');


router.post('/signup', signup);


router.post('/login', login);


router.get('/profile', authMiddleware, profile);

router.post('/TokenisValid', TokenisValid);

router.get('/', authMiddleware, getdata);

module.exports = router;
