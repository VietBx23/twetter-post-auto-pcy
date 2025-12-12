const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);

console.log('FFmpeg Path:', ffmpegPath);

ffmpeg.getAvailableFormats(function(err, formats) {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('FFmpeg is working! Format count:', Object.keys(formats).length);
  }
});
