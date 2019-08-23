<h1>mongodb-data-sync</h1>
Duplicate data between multiple collections (<a href='https://en.wikipedia.org/wiki/Denormalization'>Denormalization</a>) is a common thing in MongoDB.
It is efficient for searching, sorting and field projection.

Handling duplicate data is a pain,
you will have to create jobs to sync the data or update in place all the collections with the duplicated data.

mongodb-data-sync solves this problem. With mongodb-data-sync you declare the dependencies in a logical place, for instance, with the schemas). mongodb-data-sync takes care of syncing the data in almost real-time.   

It uses the native MongoDB <a href='https://docs.mongodb.com/manual/changeStreams/'>Change Streams</a> in order to keep track of changes.


<h2>Core Features</h2>

1. It was designed to do all the synchronization with minimum overhead on the database. Most of the checks are done in memory.

2. It uses the native MongoDB <a href='https://docs.mongodb.com/manual/changeStreams/'>Change Streams</a> in order to keep track of changes.

3. It has a plan A and B to recover after a crash.

4. It gives you an easy way to create dependencies with no worries of handling them.

5. After declaring Your dependencies you can retroactively sync your data.



<h2>Notice</h2>
<strong>mongodb-data-sync is still experimental and hasn't been tested on production yet</strong> 

<h2>Pros and cons of having duplicate data in multiple collection </h2>

<h4>Pros</h4>

1. No need for joins.
2. Index all fields.
3. Faster and easier searching and sorting.

<h4>Cons</h4>

1. More storage usage.
2. Hard to maintain: Need to keep track of all the connections (this is what mongodb-data-sync comes to solve).
3. Add write operations, every update will have to update multiple collections  

<h2>Requirements</h2>
<ul>
<li>MongoDB v3.6 or higher replaica set </li>
<li>nodejs 7.6 or higher </li>
</ul>

<h2>Architecture</h2>

mongodb-data-sync built from 2 separate parts.

1. The engine <b>(there should only be one)</b> - a nodejs server application that's you have to run from your machine(you will see how to do it in the next steps). The engine runs all the updates and recovery logic. <strong>Don't use more than 1 engine</strong>, it was designed to work as a single process. It knows where to continue after a restart/crash. Don't try auto-scaling or set 2 containers for high availability. 

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
  
  -k, --key <key>        API key to use for authentication of the SDK requests, required
  
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

// settings the communication between you app and the engine.
// use this method the number of Database you want to work on
SynchronizerClient.init({

    // your Database name the package should do the synchronization on (required)
    dbName: 'mydb', 
    
    // the URL for package engine you run  (required),  
    engineUrl: 'http://localhost:6500',
   
    //the authentication key you declared on the engine application (required)
    apiKey: 'my cat is brown', 
}); 
```
returns a Promise
//
<strong>getInstance</strong>
```javascript
const synchronizerClientInstance = SynchronizerClient.getInstance({

 // your Database name you want work on
    dbName: 'mydb', 

}); 
// return an instance related to your db(its not a mongodb db instance) for dependencies operations  
````


<strong>addDependency</strong>


```javascript
// 'addDependency' allow you to declare a dependency between 2 collections
synchronizerClientInstance.addDependency({
   
   // the dependent collection is the collection that need to get updated automatically  (required)
   dependentCollection: 'orders',
   
   //the referenced collection is the collection that get updated from your application (required)
   refCollection: 'users',
   
   // the dependent collection field to connect with (required)
   localField: 'user_id',
   
   // the referenced collection field to connect with, default _id ,using other field then _id will cuz an extra join for each check (optional)
   foreignField:"_id" , // default
   
   // an object represents the fields who need to be updated.
   // the keys are the fields you want to be updated 
   // the values are the fields you want to take the value from (required)
   fieldsToSync: {
       user_first_name:'first_name',
       user_last_name:'last_name',
       user_email:'email'
   },
   
   //the engine uses a resumetoken in order to know from where to contiue the change stream. 
   // in case you had a crash for a long time and the oplog dosont have this token anymore the engine will start update all the dependencies from the begging
   refCollectionLastUpdateField:'last_update'
});

```

return Promise with the id of the Dependency 


<strong>removeDependency</strong>


```javascript
synchronizerClientInstance.removeDependency(id);
```

return Promise

