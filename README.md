<h1>mongodb-data-sync</h1>
Duplicate data in multiple collections is a common thing in MongoDB.
It is efficient for searching, sorting and even project fields.

Handling duplicate data can be a pain.
you will have to create jobs to sync the data, or do updates in place what makes the reference collection need to know about all the collections needed data from him . and we all know the bugs that can lead to.

mongodb-data-sync comes to solve this problem by letting you declare the dependencies in a logical place in your applications (for instance where you declare your schemas ) and sync the data in almost real-time.   

mongodb-data-sync was designed to do all the updates and synchronization with minimum overhead on the database and do most of the checks in memory. 

<h2>Notice</h2>
<strong>mongodb-data-sync is still experimental and hasn't been tested on production yet</strong> 

<h2>requirements</h2>
<ul>
<li>MongoDB v3.6 or higher replaica set </li>
<li>nodejs 7.6 or higher </li>
</ul>

<h2>Architecture</h2>
mongodb-data-sync built from 2 seprate parts.

1. The server application(there can only be one)- this what runs all the updates logic,<strong>don't use  more than 1 application</strong>, it was designed to work as a single process and knows from where to continue after restart, crash  so dont try to do auto-scaling or set 2 containers for high availability 

2. The SDK - responsible for manging the database dependencies of the your application ,

<h2>Instructions</h2>

The Instructions will address the 2 parts separately,
 
 the server that runs the logic.
 
 the SDK that run the communication between your app and the server 

<h4>Server</h4>

Run  

```
npm install mongodb-data-sync -g
```
 
Then in the cmd run
 
```
mongodb-data-sync --key "some key" --url "mongodb connection url"
```
```
Options:

  -p, --port <port>       server port. 
  
  -d, --dbname <dbname>  the database name for the package. 
  
  -k, --key              API key to used for authentication of the SDK requests, required
  
  -u, --url              MongoDB connection url, required
  
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

