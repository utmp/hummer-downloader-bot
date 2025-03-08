const sqlite3 = require('sqlite3').verbose();
const fs = require("node:fs");
const path = require('node:path');

const dbPath = path.join(__dirname, 'data.db');
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, '');
}

function getExistingVideo(link) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err);
                reject(err);
                return;
            }

            // First create table if it doesn't exist
            db.run(`CREATE TABLE IF NOT EXISTS history (
                "id" INTEGER PRIMARY KEY AUTOINCREMENT,
                datetime TEXT NOT NULL,
                fileSize INTEGER NOT NULL,
                filename TEXT NOT NULL,
                fileid TEXT NOT NULL,
                chatid NUMBER NOT NULL,
                link TEXT NOT NULL,
                title TEXT NOT NULL
            )`, (err) => {
                if (err) {
                    console.error('Error creating table:', err);
                    db.close();
                    reject(err);
                    return;
                }

                // Now query the table
                db.get('SELECT fileid,title FROM history WHERE link = ?', [link], (err, row) => {
                    if (err) {
                        console.error('Error checking existing video:', err);
                        db.close();
                        reject(err);
                        return;
                    }

                    db.close();
                    resolve(row ? {fileid:row.fileid,title:row.title} : null);
                });
            });
        });
    });
}

function writeData(datetime, fileSize, filename, fileid, chatid, link,title) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err);
                reject(err);
                return;
            }
            
            db.all(`CREATE TABLE IF NOT EXISTS history (
                "id" INTEGER PRIMARY KEY AUTOINCREMENT,
                datetime TEXT NOT NULL,
                fileSize INTEGER NOT NULL,
                filename TEXT NOT NULL,
                fileid TEXT NOT NULL,
                chatid NUMBER NOT NULL,
                link TEXT NOT NULL,
                title TEXT NOT NULL
            )`, (err) => {
                if (err) {
                    console.error('Error creating table:', err);
                    db.close();
                    reject(err);
                    return;
                }

                db.run(`INSERT INTO history(datetime, fileSize, filename, fileid, chatid, link,title) 
                    VALUES(?, ?, ?, ?, ?, ?,?)`, 
                    [datetime, fileSize, filename, fileid, chatid, link,title],
                    (err) => {
                        if (err) {
                            console.error('Error inserting data:', err);
                            reject(err);
                        } else {
                            resolve(true);
                        }
                        db.close();
                    });
            });
        });
    });
}



function writeUsersInfo(datetime, chatid, username, firstname, lastname, birthdate, bio) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err);
                reject(err);
                return;
            }
            
            db.run(`CREATE TABLE IF NOT EXISTS users (
                "id" INTEGER PRIMARY KEY AUTOINCREMENT,
                datetime TEXT NOT NULL,
                chatid NUMBER NOT NULL UNIQUE,
                username TEXT,
                firstname TEXT,
                lastname TEXT,
                birthdate NUMBER,
                bio TEXT
            )`, (err) => {
                if (err) {
                    console.error('Error creating table:', err);
                    db.close();
                    reject(err);
                    return;
                }

                db.get('SELECT chatid FROM users WHERE chatid = ?', [chatid], (err, row) => {
                    if (err) {
                        console.error('Error checking existing user:', err);
                        db.close();
                        reject(err);
                        return;
                    }

                    if (row) {
                        db.close();
                        resolve(false);
                        return;
                    }

                    db.run(`INSERT INTO users(datetime, chatid, username, firstname, lastname, birthdate, bio) 
                        VALUES(?, ?, ?, ?, ?, ?, ?)`, 
                        [datetime, chatid, username, firstname, lastname, birthdate, bio],
                        (err) => {
                            if (err) {
                                console.error('Error inserting user:', err);
                                reject(err);
                            } else {
                                resolve(true);
                            }
                            db.close();
                        });
                });
            });
        });
    });
}
function adminPanel(){
    return new Promise((res,rej)=>{
        const db = new sqlite3.Database(dbPath,(err)=>{
            if (err) {
                console.error('Error opening database:', err);
                rej(err);
                return;
            }
            db.get(`SELECT 
(
SELECT COUNT(DISTINCT u.id) FROM users U) AS user_number,
SUM(f.fileSize) AS total_file_size,
COUNT(f.id) as total_file_number
FROM history f;`,(err,row)=>{
    if(err){
        rej(err);
    }
    db.close();
    res(row ? {totalUsers:row.user_number,totalFileSize:row.total_file_size,totalFileNumber:row.total_file_number}: null)
})
        })
    })
}
module.exports = { writeData, writeUsersInfo,getExistingVideo,adminPanel };