const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const wakeUpDyno = require("./wakeUpDyno");

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Create link to Angular build directory
app.use(express.static(path.join(__dirname, "/dist/yt-playlist-app/")));

// non-root requests being redirected
app.get('/*', function (req, res) {
	res.sendFile(path.join(__dirname, "/dist/yt-playlist-app/index.html"));
});

const port = process.env.PORT || 8080;
const MAIN_URL = "https://ytpp.herokuapp.com";
app.listen(port, () => {
    console.log("Express server running on port", port);
    // wakeUpDyno(MAIN_URL); // will start once server starts
});
