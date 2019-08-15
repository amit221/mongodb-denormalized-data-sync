<h1>mongodb-data-sync</h1>
In MongoDB having duplicate data between multiple collections is not an uncommon thing, It is efficient for searching, sorting or event for just project fields.
 
handling this duplicated data can be a pain in the ass, you will have to create jobs to sync the data, or do updates in place what makes the ref collection need to know about all the collections needed data from him . and we all know the bugs that can lead to.

mongodb-data-sync comes to solve this problem by letting you declare the dependencies in a logical place in your applications (for instance where you declare your schemas ) and sync the data in  almost real-time.   

mongodb-data-sync was designed to do all the updates and synchronization with minimum overhead on the database and do most of the checks in memory. 

<h2>Notice</h2>
<strong>mongodb-data-sync is still experimental and hasn't been tested on production yet</strong> 
<h2>Architecture</h2>
mongodb-data-sync built from 2 parts.

1. The server(there can only be one)- this what runs all the updates logic,<strong>don't use  more than 1 process</strong>, it was designed to work as a single process and knows from where to continue after restart, crash 

2. The client - this is the SDK for manging the database dependencies 

<h2>How to use?</h2>
 