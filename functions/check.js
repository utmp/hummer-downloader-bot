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

function selectFormat(url) {
    return new Promise((resolve, reject) => {
        const command = `yt-dlp ${url} -F | grep -E '144|240|360|480|720|1080|1440|2160'`;
        exec(command, (err, stdout, stderr) => {
            if (err) {
                reject(err);
                return;
            }

            if (stderr) {
                reject(stderr);
                return;
            }

            const lines = stdout.trim().split('\n');
            const formats = [];

            for (const line of lines) {
                // Skip empty lines
                if (!line.trim()) continue;

                // Extract id (first number at the start of the line)
                const idMatch = line.match(/^\s*(\d+)/);
                if (!idMatch) continue;
                const id = idMatch[1];

                // Extract format (typically the first non-numeric word)
                const formatMatch = line.match(/^\s*\d+\s+(\w+)/);
                if (!formatMatch) continue;
                const format = formatMatch[1];

                // Extract resolution (NxN pattern)
                const resolutionMatch = line.match(/(\d+x\d+)/);
                if (!resolutionMatch) continue;
                const resolution = resolutionMatch[1];

                // Extract fps (number after resolution)
                const fpsMatch = line.match(/\d+x\d+\s+(\d+)/);
                const fps = fpsMatch ? parseInt(fpsMatch[1]) : null;

                // Extract filesize (number followed by KiB, MiB, or GiB)
                const filesizeMatch = line.match(/(\d+\.\d+[KMG]iB|\d+[KMG]iB)/);
                const filesize = filesizeMatch ? filesizeMatch[1] : null;

                formats.push({
                    id,
                    format,
                    resolution,
                    fps,
                    filesize,
                });
            }

            // Group formats by resolution and include all formats for each resolution
            const uniqueFormats = [];
            const seenResolutions = new Set();

            for (const format of formats) {
                if (!seenResolutions.has(format.resolution)) {
                    seenResolutions.add(format.resolution);
                    uniqueFormats.push(format);
                }
            }

            resolve(uniqueFormats); // Resolve the promise with the unique formats
        });
    });
}

module.exports = {isValidUrl,checkFileSize,getTitle,selectFormat}