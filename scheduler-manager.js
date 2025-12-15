const cron = require('node-cron');
const axios = require('axios');
const dataManager = require('./data-manager');

class SchedulerManager {
  constructor() {
    this.jobs = new Map();
    this.loadScheduledTweets();
  }

  // Load existing scheduled tweets from file and create cron jobs
  async loadScheduledTweets() {
    try {
      const scheduledTweets = await dataManager.getScheduledTweets();
      console.log(`📅 Loading ${scheduledTweets.length} scheduled tweets...`);
      
      for (const tweet of scheduledTweets) {
        const scheduleTime = new Date(tweet.scheduledTime);
        const now = new Date();
        
        // Only schedule future tweets
        if (scheduleTime > now) {
          this.createCronJob(tweet);
        } else {
          // Mark past tweets as expired
          await dataManager.updateScheduledTweetStatus(tweet.id, 'EXPIRED');
        }
      }
      
      console.log(`✅ Loaded ${this.jobs.size} active scheduled tweets`);
    } catch (error) {
      console.error('❌ Error loading scheduled tweets:', error);
    }
  }

  // Create a new scheduled tweet
  async scheduleNewTweet(tweetData, scheduledTime, twitterClient) {
    const scheduleId = Date.now() + Math.floor(Math.random() * 1000);
    const scheduleDate = new Date(scheduledTime);
    const now = new Date();
    
    // Validate schedule time
    if (scheduleDate <= now) {
      throw new Error('Thời gian lập lịch phải trong tương lai');
    }
    
    // Save to file
    await dataManager.saveScheduledTweet(
      scheduleId,
      scheduleDate.toISOString(),
      tweetData.text,
      tweetData.imageUrls || []
    );
    
    // Create cron job
    const tweet = {
      id: scheduleId,
      scheduledTime: scheduleDate.toISOString(),
      text: tweetData.text,
      imageUrls: tweetData.imageUrls || [],
      imageCount: (tweetData.imageUrls || []).length
    };
    
    this.createCronJob(tweet, twitterClient);
    
    console.log(`✅ Scheduled tweet ${scheduleId} for ${scheduleDate.toLocaleString('vi-VN')}`);
    return scheduleId;
  }

  // Create cron job for a tweet
  createCronJob(tweet, twitterClient = null) {
    const scheduleDate = new Date(tweet.scheduledTime);
    
    // Create cron format: second minute hour day month dayOfWeek
    const cronTime = `${scheduleDate.getSeconds()} ${scheduleDate.getMinutes()} ${scheduleDate.getHours()} ${scheduleDate.getDate()} ${scheduleDate.getMonth() + 1} *`;
    
    console.log(`📅 Creating cron job for tweet ${tweet.id}: ${cronTime}`);
    
    const job = cron.schedule(cronTime, async () => {
      try {
        console.log(`🚀 Executing scheduled tweet ${tweet.id} at ${new Date().toLocaleString('vi-VN')}`);
        
        if (twitterClient) {
          await this.executeScheduledTweet(tweet, twitterClient);
        } else {
          console.log('⚠️ No Twitter client provided, marking as executed');
          await dataManager.updateScheduledTweetStatus(tweet.id, 'EXECUTED_NO_CLIENT');
        }
        
        // Remove job after execution
        this.jobs.delete(tweet.id);
        
      } catch (error) {
        console.error(`❌ Error executing scheduled tweet ${tweet.id}:`, error);
        await dataManager.updateScheduledTweetStatus(tweet.id, 'ERROR');
      }
    }, {
      scheduled: true,
      timezone: 'Asia/Ho_Chi_Minh'
    });

    this.jobs.set(tweet.id, job);
  }

  // Execute a scheduled tweet
  async executeScheduledTweet(tweet, twitterClient) {
    try {
      let mediaIds = [];
      
      // Upload images if any
      if (tweet.imageUrls && tweet.imageUrls.length > 0) {
        console.log(`📸 Uploading ${tweet.imageUrls.length} images for scheduled tweet...`);
        
        for (let i = 0; i < Math.min(tweet.imageUrls.length, 4); i++) {
          try {
            const mediaId = await this.downloadAndUploadImage(twitterClient, tweet.imageUrls[i], `(${i+1}/4)`);
            mediaIds.push(mediaId);
          } catch (error) {
            console.error(`❌ Error uploading image ${i+1}:`, error.message);
          }
        }
      }

      // Post tweet
      const tweetOptions = { text: tweet.text };
      if (mediaIds.length > 0) {
        tweetOptions.media = { media_ids: mediaIds };
      }
      
      const result = await twitterClient.v2.tweet(tweetOptions);
      
      console.log(`✅ Posted scheduled tweet ${tweet.id}! Tweet ID: ${result.data.id}`);
      
      // Log posted tweet
      await dataManager.logPostedTweet(result.data.id, tweet.text, mediaIds.length, 'SUCCESS');
      
      // Update scheduled tweet status
      await dataManager.updateScheduledTweetStatus(tweet.id, 'POSTED');
      
      return result;
      
    } catch (error) {
      console.error(`❌ Error posting scheduled tweet ${tweet.id}:`, error);
      await dataManager.updateScheduledTweetStatus(tweet.id, 'ERROR');
      throw error;
    }
  }

  // Helper function to download and upload image (simplified version)
  async downloadAndUploadImage(client, imageUrl, context = '') {
    console.log(`📥 Downloading and uploading image ${context}: ${imageUrl}`);
    
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        maxContentLength: 5 * 1024 * 1024
      });

      const buffer = Buffer.from(response.data);
      const contentType = response.headers['content-type'] || 'image/jpeg';
      
      // Validate
      if (!buffer || buffer.length === 0) {
        throw new Error('Empty image data');
      }
      
      if (buffer.length < 1024) {
        throw new Error('Image too small');
      }

      // Upload to Twitter
      const mediaId = await client.v1.uploadMedia(buffer, { mimeType: contentType });
      console.log(`✅ Uploaded image ${context}, Media ID: ${mediaId}`);
      
      return mediaId;
      
    } catch (error) {
      console.error(`❌ Failed to upload image ${context}:`, error.message);
      throw error;
    }
  }

  // Cancel a scheduled tweet
  async cancelScheduledTweet(tweetId) {
    try {
      // Stop cron job
      if (this.jobs.has(tweetId)) {
        this.jobs.get(tweetId).stop();
        this.jobs.delete(tweetId);
        console.log(`🛑 Stopped cron job for tweet ${tweetId}`);
      }
      
      // Update status in file
      await dataManager.updateScheduledTweetStatus(tweetId, 'CANCELLED');
      
      console.log(`✅ Cancelled scheduled tweet ${tweetId}`);
      return true;
    } catch (error) {
      console.error(`❌ Error cancelling tweet ${tweetId}:`, error);
      return false;
    }
  }

  // Get all active scheduled tweets
  async getActiveScheduledTweets() {
    return await dataManager.getScheduledTweets();
  }

  // Auto schedule tweets at fixed times
  async autoScheduleTweets(articles, startDate = null) {
    const timeSlots = ['08:00', '12:00', '17:00', '21:00'];
    const scheduledTweets = [];
    
    // Start from tomorrow if no start date provided
    const baseDate = startDate ? new Date(startDate) : new Date();
    if (!startDate) {
      baseDate.setDate(baseDate.getDate() + 1);
    }
    baseDate.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const dayOffset = Math.floor(i / 4);
      const timeSlotIndex = i % 4;
      
      const scheduleDate = new Date(baseDate);
      scheduleDate.setDate(scheduleDate.getDate() + dayOffset);
      
      const [hours, minutes] = timeSlots[timeSlotIndex].split(':').map(Number);
      scheduleDate.setHours(hours, minutes, 0, 0);
      
      try {
        const tweetData = {
          text: article.content || article.title,
          imageUrls: article.images || []
        };
        
        const scheduleId = await this.scheduleNewTweet(tweetData, scheduleDate.toISOString());
        
        scheduledTweets.push({
          id: scheduleId,
          title: article.title,
          scheduledTime: scheduleDate.toISOString(),
          timeSlot: timeSlots[timeSlotIndex],
          day: dayOffset + 1,
          success: true
        });
        
      } catch (error) {
        console.error(`❌ Error auto-scheduling article ${i + 1}:`, error);
        scheduledTweets.push({
          title: article.title,
          error: error.message,
          success: false
        });
      }
    }
    
    return scheduledTweets;
  }

  // Get job status
  getJobsStatus() {
    return {
      totalJobs: this.jobs.size,
      activeJobs: Array.from(this.jobs.keys())
    };
  }
}

module.exports = new SchedulerManager();