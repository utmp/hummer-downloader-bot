const { exec } = require('child_process');

function checkFileSize(url) {
    return new Promise((resolve, reject) => {
        const command = `yt-dlp -O "%(filesize,filesize_approx)s" --get-id ${url}`;
        
        exec(command, (err, stdout, stderr) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (stderr) {
                reject(stderr);
                return;
            }

            const [filesize, fileId] = stdout.trim().split('\n');
            resolve({
                filesize: parseInt(filesize) || 0,
                fileId: fileId
            });
        });
    });
}
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}
function getTitle(url){
    return new Promise((res,rej)=>{
        const command = `yt-dlp --get-title ${url}`;
        exec(command,(err,stdout,stderr)=>{
            if(err){
                rej(err);
                return;
            }
            else if(stderr){
                rej(stderr);
                return;
            }
            const title = stdout;
            res(title);
        })
    })
}
module.exports = {isValidUrl,checkFileSize,getTitle}