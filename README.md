# mongodb-denormalized-data-sync
In MongoDB having part od the same data in multiple collections is not an uncommon thing,
<br>
It is rely efficient for searching , sorting or event for just project fields.
<br>
handling this duplicated data can be a pain in the ass , you will have to create jobs to sync the data , or do updates in place what makes the ref collection need to know about all the collections needed data from him . and we all know the bugs that can lead to.
<br><br>
 mongodb-denormalized-data-sync comes to solve this problem by letting you declare the dependencies where this can be close to your schema and  almost real time data sync
 <br>
 it uses the power of the mongodb change stream to make the sync durable and performance efficient  


dont use high availability it was designed to work as a single process and knows  from where to continue after restart 
