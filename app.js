const express = require('express')
const {MongoClient, ObjectId} = require('mongodb')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const app = express()

require('dotenv').config();
app.use(express.json())
app.use(cors())

let client

const initializeDBAndServer = async () => {
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD;
    const dbCluster = process.env.DB_CLUSTER;
    const dbName = process.env.DB_NAME;

    const uri = `mongodb+srv://${dbUser}:${dbPassword}@${dbCluster}/${dbName}?retryWrites=true&w=majority`;    
    client = new MongoClient(uri)

    try{
        await client.connect()
        console.log('Connected to MongoDB...')

        const port = process.env.PORT || 3000
        app.listen(port, () => {
            console.log('Server Running at Port:', port)
        })

    }
    catch(e){
        console.log(`Error Connecting to DB: ${e.message}`)
        process.exit(1)
    }
}

initializeDBAndServer()


// Middleware Function

const authenticateToken = (request, response, next) => {
    let jwtToken

    const authHeader = request.headers["authorization"]

    if(authHeader !== undefined){
        jwtToken = authHeader.split(" ")[1]
    }
    if(jwtToken === undefined){
        response.status(401).send({message: "Invalid JWT Token"})
    }
    else{
        jwt.verify(jwtToken, "MY_SECRET_TOKEN", async(error, payload) => {
            if(error){
                response.status(401).send({message: error})
            }
            else{
                request.userId = payload.userId
                next()
            }
        })
        
    }
}


// API-1 Create New User

app.post('/register', async(request, response) => {
    const {username, email, password} = request.body
    const userCollection = client.db(process.env.DB_NAME).collection('users')

    const checkUserInDB = await userCollection.find({email}).toArray()
    const checkUsernameInDB = await userCollection.find({userName: username}).toArray()

    try{
        if(checkUserInDB.length === 0){
            if(checkUsernameInDB.length === 0){
                const hashedPassword = await bcrypt.hash(password, 10)
    
                if(username !== undefined && email !== undefined && password !== undefined){
                    const userDetails = {
                        userName: username,
                        email: email,
                        password: hashedPassword,
                    }
    
                    await userCollection.insertOne(userDetails)
                    response.status(201).send({message: "User Registered Successfully"})
                }
                else{
                    response.status(401).send({message: "Please Enter Valid User Details"})
                }
            }
            else{
                response.status(401).send({message: "Username Already Used"})
            }
        }
        else{
            response.status(401).send({message: "User Already Exists"})
        }
    }
    catch(e){
        response.status(500).send({message: "Internal Server Error"})
    }
    
})



// API - 2 User Login

app.post('/login', async(request, response) => {
    const {username, password} = request.body
    const userCollection = client.db(process.env.DB_NAME).collection('users')

    const checkUserInDB = await userCollection.find({userName: username}).toArray()

    try{
        if(checkUserInDB.length === 1){
            const verifyPassword = await bcrypt.compare(password, checkUserInDB[0].password)
    
            if(verifyPassword){
                const token = jwt.sign({userId: checkUserInDB[0]._id}, 'MY_SECRET_TOKEN')
                response.status(201).send({userId: checkUserInDB[0]._id, jwtToken: token, username: username})
            }
            else{
                response.status(401).send({message: "Incorrect Password"})
            }
        }
        else{
            response.status(401).send({message: "User Doesn't Exist"})
        }
    }
    catch(e){
        response.status(500).send({message: "Internal Server Error"})
    }
})

// API - 3 New Task

app.post('/tasks', authenticateToken, async(request, response) => {
    const {name, description, duedate, status, priority} = request.body

    const userCollection = client.db(process.env.DB_NAME).collection('users')
    const userId = new ObjectId(request.userId)
    const checkUserInDB = await userCollection.find({_id: userId}).toArray()
    
    try{
        if(checkUserInDB.length === 1){
            if(name !== undefined && description !== undefined && duedate !== undefined){
                
                function parseDate(dateStr) {
                    const [day, month, year] = dateStr.split('-');
                    return new Date(year, month - 1, day); // Month is 0-indexed in Date
                }
                
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const selectedDateStr = event.target.value;
                const selectedDate = parseDate(selectedDateStr);
                if (selectedDate < today) {
                    response.status(404).send({message: "Invalid Due Date: cannot be in the past"})
                } else {
                    const tasksCollection = client.db(process.env.DB_NAME).collection('tasks')
                    const newTask = {
                        name: name,
                        description: description,
                        dueDate: duedate,
                        status: status,
                        priority: priority
                    }

                    await tasksCollection.insertOne(newTask)
                    response.status(201).send({message: "New Task Added Successfully"})
                }
            }
            else{
                response.status(404).send({message: "Enter all the fields"})
            }
        }
        else{
            response.status(404).send({message: "Invalid User Request"})
        }
    }
    catch(e){
        response.status(500).send({message: "Internal Server Error"})
    }
})


// API - 4 Update Task
app.put('/tasks/:id', authenticateToken, async (request, response) => {
    const { name, description, status, priority, duedate } = request.body
    const taskId = request.params.id

    const tasksCollection = client.db(process.env.DB_NAME).collection('tasks')
    
    try {
        // Find the task by taskId
        const task = await tasksCollection.findOne({ _id: new ObjectId(taskId) })
        
        if (task) {
            // Prepare the update object, only including non-null/undefined fields
            const updateFields = {}

            if (name !== undefined) updateFields.name = name
            if (description !== undefined) updateFields.description = description
            if (status !== undefined) updateFields.status = status
            if (priority !== undefined) updateFields.priority = priority
            
            if (duedate !== undefined) {
                // Parse the new due date in dd-mm-yyyy format
                const parseDate = (dateStr) => {
                    const [day, month, year] = dateStr.split('-');
                    return new Date(year, month - 1, day); // Month is 0-indexed
                }
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Ensure comparison without time

                const selectedDate = parseDate(duedate);

                if (selectedDate < today) {
                    return response.status(400).send({ message: "Invalid Due Date: cannot be in the past" });
                }

                updateFields.dueDate = duedate;
            }

            // If there are fields to update
            if (Object.keys(updateFields).length > 0) {
                await tasksCollection.updateOne(
                    { _id: new ObjectId(taskId) },
                    { $set: updateFields }
                )
                response.status(201).send({ message: "Task updated successfully" })
            } else {
                response.status(400).send({ message: "No valid fields provided for update" })
            }
        } else {
            response.status(404).send({ message: "Task not found" })
        }
    } catch (e) {
        console.error(e)
        response.status(500).send({ message: "Internal Server Error" })
    }
});

// API - 5 Get All Tasks of a User

app.get('/tasks', authenticateToken, async(request, response) => {
    const userId = new ObjectId(request.userId)
    
    const tasksCollection = client.db(process.env.DB_NAME).collection('tasks')
    
    try {
        // Find all tasks for the authenticated user
        const userTasks = await tasksCollection.find({ userId: userId }).toArray()
        
        if (userTasks.length > 0) {
            response.status(200).send(userTasks)
        } else {
            response.status(404).send({ message: "No tasks Found" })
        }
    } catch (e) {
        console.error(e)
        response.status(500).send({ message: "Internal Server Error" })
    }
})


// API - 6 Delete Task

app.delete('/tasks/:id', authenticateToken, async(request, response) => {
    const taskId = request.params.id

    const tasksCollection = client.db(process.env.DB_NAME).collection('tasks')
    
    try {
        // Find and delete the task by taskId
        const result = await tasksCollection.deleteOne({ _id: new ObjectId(taskId) })
        
        if (result.deletedCount === 1) {
            response.status(201).send({ message: "Task deleted successfully" })
        } else {
            response.status(404).send({ message: "Task not found" })
        }
    } catch (e) {
        response.status(500).send({ message: "Internal Server Error" })
    }
})

