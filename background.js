const { MongoClient } = require('mongodb');
const { connectDB } = require('./db/config');
const { startEngagementTracking, updateEngagementMetrics } = require('./db/engagement-operations');
const uri = "mongodb+srv://malaygupta:3VXz24KhjZJEbX55@linkedin-comment-genera.oq68x.mongodb.net/?retryWrites=true&w=majority&appName=linkedin-comment-generator";
const client = new MongoClient(uri);

// Initialize database connection
connectDB().catch(console.error);

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "saveComment") {
        saveCommentToDb(request.data)
            .then(async (result) => {
                // Start tracking engagement for the saved comment
                await startEngagementTracking(result.comment, result.comment.postUrl);
                sendResponse({ success: true, result });
            })
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Will respond asynchronously
    }
    
    if (request.action === "getComments") {
        getCommentsFromDb(request.postId)
            .then(comments => sendResponse({ success: true, comments }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    
    if (request.action === 'generateComments') {
        handleCommentGeneration(request.postData, request.userContext)
            .then(response => sendResponse(response))
            .catch(error => sendResponse({ error: error.message }));
        return true; // Will respond asynchronously
    }

    if (request.action === 'updateEngagement') {
        updateCommentEngagement(request.commentId, request.metrics)
            .then(result => sendResponse({ success: true, result }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

async function handleCommentGeneration(postData, userContext) {
    try {
        // Save the post data
        await savePostToDb({
            postId: postData.id,
            postContent: postData.content,
            postUrl: postData.url,
            authorId: postData.authorId,
            authorName: postData.authorName,
            metadata: {
                likes: postData.likes,
                comments: postData.comments,
                shares: postData.shares
            }
        });

        // Generate comments using existing API
        const generatedComments = await generateCommentsFromAPI(postData.content);

        // Save generated comments
        const savedComment = await saveGeneratedCommentsToDb(postData.id, generatedComments, userContext);

        // Start engagement tracking
        await startEngagementTracking(savedComment, postData.url);

        // Update analytics
        await updateAnalytics({
            generationTime: performance.now(),
            tones: generatedComments.map(comment => comment.tone)
        });

        return { success: true, comments: generatedComments };
    } catch (error) {
        console.error('Error in comment generation:', error);
        throw error;
    }
}

async function savePostToDb(postData) {
    try {
        await client.connect();
        const db = client.db("linkedin_comments");
        const collection = db.collection("posts");
        
        const postDoc = {
            postId: postData.postId,
            postContent: postData.postContent,
            postUrl: postData.postUrl,
            authorId: postData.authorId,
            authorName: postData.authorName,
            metadata: {
                likes: postData.metadata.likes,
                comments: postData.metadata.comments,
                shares: postData.metadata.shares
            },
            createdAt: new Date()
        };
        
        const result = await collection.insertOne(postDoc);
        console.log("Post saved to database:", result);
        return result;
    } catch (error) {
        console.error("Error saving to database:", error);
        throw error;
    } finally {
        await client.close();
    }
}

async function saveGeneratedCommentsToDb(postId, generatedComments, userContext) {
    try {
        await client.connect();
        const db = client.db("linkedin_comments");
        const collection = db.collection("generated_comments");
        
        const generatedCommentsDoc = {
            postId,
            generatedComments: generatedComments.map(comment => ({
                text: comment.text,
                tone: comment.tone,
                timestamp: new Date(),
                aiMetadata: {
                    model: 'gpt-3.5-turbo',
                    confidence: comment.confidence || 0.95
                },
                isSelected: false
            })),
            userContext: {
                preferredTone: userContext?.preferredTone || 'professional',
                customInstructions: userContext?.customInstructions || ''
            },
            createdAt: new Date()
        };
        
        const result = await collection.insertOne(generatedCommentsDoc);
        console.log("Generated comments saved to database:", result);
        return generatedCommentsDoc;
    } catch (error) {
        console.error("Error saving to database:", error);
        throw error;
    } finally {
        await client.close();
    }
}

async function updateAnalytics(analyticsData) {
    try {
        await client.connect();
        const db = client.db("linkedin_comments");
        const collection = db.collection("analytics");
        
        const analyticsDoc = {
            timestamp: new Date(),
            generationTime: analyticsData.generationTime,
            tones: analyticsData.tones,
            // Add any other analytics data you want to track
        };
        
        const result = await collection.insertOne(analyticsDoc);
        console.log("Analytics updated:", result);
        return result;
    } catch (error) {
        console.error("Error updating analytics:", error);
        throw error;
    } finally {
        await client.close();
    }
}

async function saveCommentToDb(data) {
    try {
        await client.connect();
        const db = client.db("linkedin_comments");
        const collection = db.collection("comments");
        
        const commentDoc = {
            postId: data.postId,
            postUrl: data.postUrl,
            commentText: data.commentText,
            authorId: data.authorId,
            authorName: data.authorName,
            timestamp: new Date(),
            metadata: {
                likes: 0,
                replies: 0
            }
        };
        
        const result = await collection.insertOne(commentDoc);
        console.log("Comment saved to database:", result);
        return { success: true, comment: commentDoc };
    } catch (error) {
        console.error("Error saving to database:", error);
        throw error;
    } finally {
        await client.close();
    }
}

async function getCommentsFromDb(postId) {
    try {
        await client.connect();
        const db = client.db("linkedin_comments");
        const collection = db.collection("comments");
        
        const comments = await collection.find({ postId }).toArray();
        return comments;
    } catch (error) {
        console.error("Error retrieving from database:", error);
        throw error;
    } finally {
        await client.close();
    }
}

async function updateCommentEngagement(commentId, metrics) {
    try {
        return await updateEngagementMetrics(commentId, {
            likes: metrics.likes,
            replies: metrics.replies,
            clickThroughRate: metrics.clickThroughRate,
            conversionRate: metrics.conversionRate,
            responseTime: metrics.responseTime
        });
    } catch (error) {
        console.error("Error updating engagement metrics:", error);
        throw error;
    }
}

// Your existing API call function
async function generateCommentsFromAPI(postContent) {
    // Implementation remains the same
    return [];
}
