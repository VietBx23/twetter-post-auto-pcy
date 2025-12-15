const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class DataManager {
  constructor() {
    this.dataDir = path.join(__dirname, 'data');
    this.postedTweetsFile = path.join(this.dataDir, 'posted_tweets.txt');
    this.scheduledTweetsFile = path.join(this.dataDir, 'scheduled_tweets.txt');
    this.apiArticlesFile = path.join(this.dataDir, 'api_articles.txt');
    
    // Ensure data directory exists
    if (!fsSync.existsSync(this.dataDir)) {
      fsSync.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // Posted Tweets Management
  async logPostedTweet(tweetId, content, imageCount = 0, status = 'SUCCESS') {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp}|${tweetId}|${content.replace(/\n/g, ' ').replace(/\|/g, '｜')}|${imageCount}|${status}\n`;
    
    try {
      await fs.appendFile(this.postedTweetsFile, logEntry, 'utf8');
      console.log('✅ Logged posted tweet:', tweetId);
    } catch (error) {
      console.error('❌ Error logging posted tweet:', error);
    }
  }

  async getPostedTweets(limit = 50) {
    try {
      const data = await fs.readFile(this.postedTweetsFile, 'utf8');
      const lines = data.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      
      return lines.slice(-limit).reverse().map(line => {
        const [timestamp, tweetId, content, imageCount, status] = line.split('|');
        return {
          timestamp: timestamp?.trim(),
          tweetId: tweetId?.trim(),
          content: content?.replace(/｜/g, '|').trim() || '',
          imageCount: parseInt(imageCount) || 0,
          status: status?.trim() || 'UNKNOWN'
        };
      });
    } catch (error) {
      console.error('❌ Error reading posted tweets:', error);
      return [];
    }
  }

  async getTodayTweetsCount() {
    try {
      const tweets = await this.getPostedTweets(1000);
      const today = new Date().toDateString();
      
      return tweets.filter(tweet => {
        if (!tweet.timestamp || !tweet.status) return false;
        const tweetDate = new Date(tweet.timestamp).toDateString();
        return tweetDate === today && tweet.status === 'SUCCESS';
      }).length;
    } catch (error) {
      console.error('❌ Error counting today tweets:', error);
      return 0;
    }
  }

  async getTotalTweetsCount() {
    try {
      const tweets = await this.getPostedTweets(10000);
      return tweets.filter(tweet => tweet.status === 'SUCCESS').length;
    } catch (error) {
      console.error('❌ Error counting total tweets:', error);
      return 0;
    }
  }

  // Scheduled Tweets Management
  async saveScheduledTweet(scheduleId, scheduledTime, content, imageUrls = [], status = 'PENDING') {
    const timestamp = new Date().toISOString();
    const imageUrlsStr = Array.isArray(imageUrls) ? imageUrls.join(',') : '';
    const logEntry = `${scheduleId}|${scheduledTime}|${content.replace(/\n/g, ' ').replace(/\|/g, '｜')}|${imageUrlsStr}|${status}|${timestamp}\n`;
    
    try {
      await fs.appendFile(this.scheduledTweetsFile, logEntry, 'utf8');
      console.log('✅ Saved scheduled tweet:', scheduleId);
    } catch (error) {
      console.error('❌ Error saving scheduled tweet:', error);
    }
  }

  async getScheduledTweets() {
    try {
      const data = await fs.readFile(this.scheduledTweetsFile, 'utf8');
      const lines = data.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      
      return lines.map(line => {
        const [scheduleId, scheduledTime, content, imageUrls, status, createdAt] = line.split('|');
        return {
          id: parseInt(scheduleId),
          scheduledTime,
          text: content?.replace(/｜/g, '|') || '',
          imageUrls: imageUrls ? imageUrls.split(',').filter(url => url.trim()) : [],
          imageCount: imageUrls ? imageUrls.split(',').filter(url => url.trim()).length : 0,
          status: status || 'PENDING',
          createdAt
        };
      }).filter(tweet => tweet.status === 'PENDING');
    } catch (error) {
      console.error('❌ Error reading scheduled tweets:', error);
      return [];
    }
  }

  async updateScheduledTweetStatus(scheduleId, newStatus) {
    try {
      const data = await fs.readFile(this.scheduledTweetsFile, 'utf8');
      const lines = data.split('\n');
      
      const updatedLines = lines.map(line => {
        if (line.startsWith(`${scheduleId}|`)) {
          const parts = line.split('|');
          if (parts.length >= 5) {
            parts[4] = newStatus; // Update status
            return parts.join('|');
          }
        }
        return line;
      });
      
      await fs.writeFile(this.scheduledTweetsFile, updatedLines.join('\n'), 'utf8');
      console.log('✅ Updated scheduled tweet status:', scheduleId, newStatus);
    } catch (error) {
      console.error('❌ Error updating scheduled tweet status:', error);
    }
  }

  async getScheduledTweetsCount() {
    try {
      const tweets = await this.getScheduledTweets();
      return tweets.length;
    } catch (error) {
      console.error('❌ Error counting scheduled tweets:', error);
      return 0;
    }
  }

  // API Articles Management
  async logApiArticle(title, imageCount, apiUrl, page, status = 'PROCESSED') {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp}|${title.replace(/\n/g, ' ').replace(/\|/g, '｜')}|${imageCount}|${apiUrl}|${page}|${status}\n`;
    
    try {
      await fs.appendFile(this.apiArticlesFile, logEntry, 'utf8');
      console.log('✅ Logged API article:', title.substring(0, 50));
    } catch (error) {
      console.error('❌ Error logging API article:', error);
    }
  }

  async getApiArticles(limit = 100) {
    try {
      const data = await fs.readFile(this.apiArticlesFile, 'utf8');
      const lines = data.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      
      return lines.slice(-limit).reverse().map(line => {
        const [timestamp, title, imageCount, apiUrl, page, status] = line.split('|');
        return {
          timestamp,
          title: title?.replace(/｜/g, '|') || '',
          imageCount: parseInt(imageCount) || 0,
          apiUrl: apiUrl || '',
          page: parseInt(page) || 1,
          status: status || 'UNKNOWN'
        };
      });
    } catch (error) {
      console.error('❌ Error reading API articles:', error);
      return [];
    }
  }

  async getApiArticlesCount() {
    try {
      const articles = await this.getApiArticles(1000);
      return articles.filter(article => article.status === 'PROCESSED').length;
    } catch (error) {
      console.error('❌ Error counting API articles:', error);
      return 0;
    }
  }

  // Recent Activity
  async getRecentActivity(limit = 10) {
    try {
      const activities = [];
      
      // Get recent posted tweets
      const postedTweets = await this.getPostedTweets(5);
      postedTweets.forEach(tweet => {
        activities.push({
          icon: 'fab fa-twitter',
          title: `Đăng tweet: ${tweet.content.substring(0, 50)}...`,
          time: this.formatTimeAgo(tweet.timestamp),
          timestamp: tweet.timestamp
        });
      });

      // Get recent scheduled tweets
      const scheduledTweets = await this.getScheduledTweets();
      scheduledTweets.slice(0, 3).forEach(tweet => {
        activities.push({
          icon: 'fas fa-clock',
          title: `Lập lịch tweet: ${tweet.text.substring(0, 50)}...`,
          time: this.formatTimeAgo(tweet.createdAt),
          timestamp: tweet.createdAt
        });
      });

      // Get recent API articles
      const apiArticles = await this.getApiArticles(3);
      apiArticles.forEach(article => {
        activities.push({
          icon: 'fas fa-database',
          title: `Xử lý API: ${article.title.substring(0, 50)}...`,
          time: this.formatTimeAgo(article.timestamp),
          timestamp: article.timestamp
        });
      });

      // Sort by timestamp and return limited results
      return activities
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
    } catch (error) {
      console.error('❌ Error getting recent activity:', error);
      return [];
    }
  }

  formatTimeAgo(timestamp) {
    try {
      const now = new Date();
      const time = new Date(timestamp);
      const diffMs = now - time;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Vừa xong';
      if (diffMins < 60) return `${diffMins} phút trước`;
      if (diffHours < 24) return `${diffHours} giờ trước`;
      if (diffDays < 7) return `${diffDays} ngày trước`;
      return time.toLocaleDateString('vi-VN');
    } catch (error) {
      return 'Không xác định';
    }
  }
}

module.exports = new DataManager();