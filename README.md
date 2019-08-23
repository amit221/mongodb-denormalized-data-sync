<h1>mongodb-data-sync</h1>
Duplicate data between multiple collections (<a href='https://en.wikipedia.org/wiki/Denormalization'>Denormalization</a>) is a common thing in MongoDB.
It is efficient for searching, sorting and even fields projection.

Handling duplicate data is a pain,
you will have to create jobs to sync the data, or update in place all the collections with the duplicated data.

mongodb-data-sync solves this problem. With mongodb-data-sync you declare the dependencies in a logical place, for instance, with the schemas). mongodb-data-sync takes care of syncing the data in almost real-time.   

It uses the native MongoDB <a href='https://docs.mongodb.com/manual/changeStreams/'>Change Streams</a> in order to keep track of changes.


<h2>Core Features</h2>

1. It was designed to do all the synchronization with minimum overhead on the database. Most of the checks are done in memory.

2. It uses the native MongoDB <a href='https://docs.mongodb.com/manual/changeStreams/'>Change Streams</a> in order to keep track of changes.

3. It has a plan A and B to recover after a crash.

4. It gives you an easy way to create dependncies with no worries of handling them.

5. After declaring Your dependncies you can retroactive sync your data.



<h2>Notice</h2>
<strong>mongodb-data-sync is still experimental and hasn't been tested on production yet</strong> 

<h2>Pros and cons of having duplicate data in multiple collection </h2>

<h4>Pros</h4>

1. No need for joins.
2. Index all fields.
3. Faster and easier searching and sorting.

<h4>Cons</h4>

1. More storage usage.
2. Hard to maintain: Need to keep track all the connections (this is what mongodb-data-sync comes to solve).
3. Add write operations, every update will have to update multiple collections  

<h2>Requirements</h2>
<ul>
<li>MongoDB v3.6 or higher replaica set </li>
<li>nodejs 7.6 or higher </li>
</ul>

<h2>Architecture</h2>

mongodb-data-sync built from 2 separate parts.

1. The engine <b>(there should only be one)</b> - a nodejs server appliaction thats you have to run from your machine(you will see how do it in the next steps). The engine runs all the updates and recovery logic. <strong>Don't use  more than 1 engine</strong>, it was designed to work as a single process. It knows from where to continue after a restart/crash. Don't try auto-scaling or set 2 containers for high availability. 

2. The SDK - responsible for managing the database dependencies of your application. It connects your app with the engine.

<h2>Instructions</h2>

The Instructions will address the 2 parts separately: the engine and the SDK.

<h4>The engine</h4>

Run  

```
npm install mongodb-data-sync -g
```
 
Then, in the cmd run
 
```
mongodb-data-sync --key "some key" --url "mongodb connection url"
```
```
Options:

  --debug                console log important information
  
  -p, --port <port>      server port. (default: 6500)
  
  -d, --dbname <dbname>  the database name for the package. (default: "mongodb_data_sync_db")
  
  -k, --key <key>        api key to used for authentication of the sdk requests, required
  
  -u, --url <url>        MongoDB connection url, required
  
  -h, --help             output usage information
```

that's it for running the server, let's jump to the SDK  

<h4>SDK</h4>

You can look at the <a target='_blank' href='https://github.com/amit221/mongodb-denormalized-data-sync/tree/master/example'>example</a> on github

<h5>Install</h5>

```
npm install mongodb-data-sync -save
```

<strong>init</strong>

first initialize the client , do it as soon as possible in your app
```javascript
const SynchronizerClient = require('mongodb-data-sync');

SynchronizerClient.init({
    dbName: String, // the DB name you want the synchronization to work on (required)
    serviceUrl: String, // the URL for the server you run on the previous stage (required),  
    apiKey: String, // this need to be the same key you declared in your server (required)
}); 
```
returns a Promise

<strong>getInstance</strong>
```javascript
const synchronizerClientInstance = SynchronizerClient.getInstance({dbName: String}); // return an instance related to your db(its not a mongodb db instance) for dependncies oprations  
````


<strong>addDependency</strong>


```javascript

synchronizerClientInstance.addDependency({
   dependentCollection: String,// the dependent collection (required)
   refCollection: String, //the referenced collection (required)
   localField: String, // the dependent collection field to connect with (required)
   foreignField:String , // the referenced collection field to connect with, default _id ,using other field then _id will cuz an extra join for each check (optional)
   fieldsToSync: {}// the fields you want to update, the key is the field on the  dependentCollection and the value is for the refCollection
});
```

return Promise with the id of the Dependency 


<strong>removeDependency</strong>


```javascript
synchronizerClientInstance.removeDependency(id);
```

return Promise

