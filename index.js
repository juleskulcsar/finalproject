const express = require("express");
const app = express();
const compression = require("compression");
const db = require("./utils/db");
const bcrypt = require("./utils/bc");
const bodyParser = require("body-parser");
var multer = require("multer");
var uidSafe = require("uid-safe");
var path = require("path");
const s3 = require("./s3");
const config = require("./config");
const cookieSession = require("cookie-session");
const moment = require("moment");
//socket.io stuff
// const csurf = require("csurf");
const server = require("http").Server(app);
const io = require("socket.io")(server, {
    origins: "localhost:8080 192.168.50.*:*"
});

var diskStorage = multer.diskStorage({
    destination: function(req, file, callback) {
        callback(null, __dirname + "/uploads");
    },
    filename: function(req, file, callback) {
        uidSafe(24).then(function(uid) {
            callback(null, uid + path.extname(file.originalname));
        });
    }
});

var uploader = multer({
    storage: diskStorage,
    limits: {
        fileSize: 2097152
    }
});

app.use(compression());
app.use(bodyParser.json());
app.use(express.static("./public"));

const cookieSessionMiddleware = cookieSession({
    secret: `I'm always angry.`,
    maxAge: 1000 * 60 * 60 * 24 * 90
});

app.use(cookieSessionMiddleware);
io.use(function(socket, next) {
    cookieSessionMiddleware(socket.request, socket.request.res, next);
});

// app.use(csurf());
// app.use(function(req, res, next) {
//     res.cookie("mytoken", req.csrfToken());
//     next();
// });

if (process.env.NODE_ENV != "production") {
    app.use(
        "/bundle.js",
        require("http-proxy-middleware")({
            target: "http://localhost:8081/"
        })
    );
} else {
    app.use("/bundle.js", (req, res) => res.sendFile(`${__dirname}/bundle.js`));
}
//registration and login
app.get("/welcome", function(req, res) {
    if (req.session.userId) {
        res.redirect("/");
    } else {
        res.sendFile(__dirname + "/index.html");
    }
});

app.post("/signup", async (req, res) => {
    const { first, last, email, password, registeras } = req.body;

    try {
        let hash = await bcrypt.hashPassword(password);
        let id = await db.addUserInfo(first, last, email, hash, registeras);
        req.session.userId = id.rows[0].id;
        console.log("addUserInfo returns: ", id);
        res.json({ success: true });
    } catch (err) {
        console.log("err in POST /register", err);
    }
});

app.post("/login", (req, res) => {
    db.getUser(req.body.email).then(results => {
        // console.log("post /login:", results);
        if (!results.rows[0]) {
            res.json({
                success: false
            });
        }
        return bcrypt
            .checkPassword(req.body.password, results.rows[0].password)
            .then(matching => {
                // console.log(req.body.pass);
                if (matching === true) {
                    req.session.userId = results.rows[0].id;
                    res.json({
                        success: true
                    });
                } else {
                    res.json({
                        success: false
                    });
                }
            })
            .catch(err => {
                console.log("post /login error ", err);
            });
    });
});
//get the user
app.get("/profile", async (req, res) => {
    try {
        let user = await db.getUserById(req.session.userId);
        console.log("user in /profile:", user);
        if (user.rows[0].url === null) {
            user.rows[0].url = "/default.jpg";
        }
        console.log("what is this? ", user.rows[0]);
        res.json(user.rows[0]);
    } catch (err) {
        console.log("error in get /profile: ", err);
    }
});

app.post("/bio", async (req, res) => {
    try {
        await db.updateBio(req.body.bio, req.session.userId);
        res.json(req.body.bio);
    } catch (err) {
        console.log("err in post /bio: ", err);
    }
});
app.post("/skills", async (req, res) => {
    try {
        await db.updateSkills(req.body.skills, req.session.userId);
        res.json(req.body.skills);
    } catch (err) {
        console.log("err in post /skills: ", err);
    }
});
app.post("/location", async (req, res) => {
    try {
        await db.updateLocation(req.body.location, req.session.userId);
        res.json(req.body.location);
    } catch (err) {
        console.log("err in post /location: ", err);
    }
});

// app.get("/profile/:id.json", async (req, res) => {
//     try {
//         const { id } = req.params;
//         if (id == req.session.userId) {
//             res.json({
//                 error: true,
//                 sameUser: true
//             });
//         }
//         const results = await db.getUserById(id);
//         res.json(results.rows[0]);
//     } catch (err) {
//         console.log("error in get profile/:id: ", err);
//     }
// });
//upload new profile image
app.post("/upload", uploader.single("file"), s3.upload, async (req, res) => {
    const url = config.s3Url + req.file.filename;
    try {
        const results = await db.updateImage(url, req.session.userId);
        res.json(results.rows[0].url);
    } catch (err) {
        console.log("error in POST /upload; ", err);
    }
});
//logout
app.get("/logout", (req, res) => {
    req.session = null;
    res.redirect("/welcome");
});

//---------ads wall post stuff----------
//------ insert ads into database
app.post("/ads", async (req, res) => {
    const { title, description } = req.body;
    console.log("REQ BODY in post ads:", req.body);
    try {
        let id = await db.addAdInfo(req.session.userId, title, description);
        let result = await db.getUserById(req.session.userId);
        console.log("result in POST ADS: ", result.rows);
        console.log("Id in POST/ads:", id);
        // req.session.userId = id.rows[0].id;
        res.json({
                    ad_id: id.rows[0].ad_id,
                    user_id: id.rows[0].user_id,
                    title: id.rows[0].title,
                    description: id.rows[0].description,
                    first: result.rows[0].first,
                    last: result.rows[0].last
                });
    } catch (err) {
        console.log("err in POST /ads", err);
    }
});

app.get("/allads.json", async (req, res) => {
    try {
        const { rows } = await db.getAllAds();
        console.log("wtf is this rows in /allads.json: ", rows);
        res.json(rows);
    } catch (err) {
        console.log("err in GET /allads.json: ", err);
    }
});

// app.get("/ads", async (req, res) => {
//     try {
//         let ad = await db.getAdById(req.session.userId);
//         // user = user.rows[0];
//         // console.log("user:", user.rows[0]);
//
//         if (user.rows[0].image === null) {
//             user.rows[0].image = "/images/default-copy.png";
//         }
//         // console.log("USER.ROWS[0]:", user.rows[0]);
//         // console.log("USER URL:", user.rows[0].image);
//         res.json(user.rows[0]);
//     } catch (err) {
//         console.log("err in GET / ads", err);
//     }
// });

// app.post("/advertize", async (req, res) => {
//     try {
//         await db.addAd(req.body.title, req.body.description);
//         res.json(req.body);
//     } catch (err) {
//         console.log("err in POST / description", err);
//     }
// });

// app.get("/user/:id.json", async (req, res) => {
//     try {
//         const { id } = req.params;
//         if (id == req.session.userId) {
//             res.json({
//                 error: true,
//                 sameUser: true
//             });
//         }
//         const results = await db.getUserById(id);
//         res.json(results.rows[0]);
//     } catch (err) {
//         console.log("err in GET / user/:id.json", err);
//     }
// });

//keep this last
app.get("*", function(req, res) {
    res.sendFile(__dirname + "/index.html");
});

app.listen(8080, function() {
    console.log("BAM BAM! Final Project set in motion!");
});
