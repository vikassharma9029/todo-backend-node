const express = require("express");
const { ObjectId } = require('mongodb');
const cors = require('cors');
var cookieParser = require('cookie-parser');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const AuthMiddleware = require("./src/middlewares/AuthMiddleware");
const { dbInstance, getUserDetails } = require("./src/utills/dbInstance");
 

const SALT = "NKpNROxvp23DCetoXpgE";

const app = express();

app.use(cookieParser());

app.use(express.json()); // this will user to get the json request which user has send req.body.

const corsOptions = {
    origin: ['http://localhost:5173', 'http://3.107.223.94'], // Allow only your frontend client
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], // Allowed HTTP methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Allowed custom headers
    credentials: true // Allow cookies/authorization headers if needed
};

app.use(cors(corsOptions));

app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        const userCollection = dbInstance().collection("users");
        // check email exist alrady or not
        const getDetails = await getUserDetails(email);
        console.log(getDetails);
        if (getDetails) {
            res.status(200).json({
                status: "Failed",
                message: "User is already exist !"
            })
        }

        delete req.body['confirmPassword'];
        delete req.body['password'];
        const hashPass = await bcrypt.hash(password, 10);
        const completeUserData = { ...req.body, password: hashPass };
        // const dbInstance = client.db("experiment");
        const insertRec = await userCollection.insertOne(completeUserData);
        if (insertRec) {
            res.status(200).json({
                status: "Success",
                data: insertRec
            })
        } else {
            res.status(400).json({
                success: "failed",
                data: insertRec
            })
        }
    } catch (err) {
        console.log("There is some issue with register user !!" + err);
        res.status(200).send("There is some issue with register user !!");
    }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(500).send("email and password are require !"); bv
        }

        const userCollection = dbInstance().collection("users");
        const userDetails = await userCollection.findOne({ email });
        if (userDetails) {
            // need to match the password from DB 
            const matchPass = await bcrypt.compare(password, userDetails.password);
            console.log(matchPass);
            if (!matchPass) {
                res.status(500).json({
                    status: "failed",
                    message: "Username or password is not correct"
                })
            } else {
                // generate JWT token
                const token = jwt.sign({ _id: userDetails._id }, SALT);
                res.cookie("token", token);
                res.status(200).json({
                    status: "Success",
                    message: "Loged in successfully",
                    data: userDetails
                })
            }

            // if Passwords matches then need to create JWT token. 
        } else {
            res.status(500).json({
                status: "Failed",
                data: userDetails
            })
        }


    } catch (err) {
        console.log("Not able to login" + err);
        res.status(400).send("Not able to login !!");
    }
});


app.post('/todos',  AuthMiddleware,  async (req, res) => {
    // save todos in DB
    try {
        const todos = req.body;
        const todosCollection = dbInstance().collection("todo");
        const saveTodos = await todosCollection.insertOne(todos);
        if (saveTodos) {
            res.status(200).json({ status: "Success", data: saveTodos });
        } else {
            res.status(200).send("there is some issue");
        }
    } catch (err) {
        console.log("There is some problem while saving a todos");
        res.status(500).json({
            status: "failed",
            message: "There is some issue while saving todos!"
        })
    }
});

app.get('/todos', AuthMiddleware, async (req, res) => {
    // save todos in DB
    try {
        const todosCollection = dbInstance().collection("todo");
        const getAllTodos = await todosCollection.find({}).toArray();
        if (getAllTodos) {
            res.status(200).json({ status: "Success", data: getAllTodos });
        } else {
            res.status(200).send("there is some issue");
        }
    } catch (err) {
        console.log("There is some problem while fetching a todos" + err);
        res.status(500).json({
            status: "failed",
            message: "There is some issue while fetching todos!"
        })
    }
});

app.patch('/todos/:id', AuthMiddleware, async (req, res) => {
    // save todos in DB
    try {

        const { id } = req.params;
        console.log(id);

        const todosCollection = dbInstance().collection("todo");
        const getTodoById = await todosCollection.find({ _id: new ObjectId(id) }).toArray();
        console.log(req.body);
        if (getTodoById) {

            // update here
            const updateedTodos = await todosCollection.updateOne({ _id: new ObjectId(id) }, {
                $set: req.body
            })

            if (updateedTodos) {
                res.status(200).json({ status: "Success", message: "Todo has been updated successfully", data: updateedTodos });
            } else {
                res.status(200).send("there is some issue while updating the todos");
            }

        } else {
            res.status(200).send("there is some issue");
        }
    } catch (err) {
        console.log("There is some problem while updating a todos" + err);
        res.status(500).json({
            status: "failed",
            message: "There is some issue while updating todos!"
        })
    }
});

app.get("/dashboard/stats", AuthMiddleware,  async (req, res) => {
    try {
       const totalRec = await dbInstance().collection("todo").aggregate([
            {
                $facet: {
                    total: [
                        { $count: "count" }
                    ],

                    byStatus: [
                        {
                            $group: {
                                _id: "$status",
                                count: { $sum: 1 }
                            }
                        }
                    ],

                    byPriority: [
                        {
                            $group: {
                                _id: "$priority",
                                count: { $sum: 1 }
                            }
                        }
                    ],

                    overdue: [
                        {
                            $match: {
                                dueDate: { $lt: new Date() },
                                status: { $ne: "done" }
                            }
                        },
                        { $count: "count" }
                    ]
                }
            },
            {
                $project: {
                    _id: 0,
                    total: {
                        $ifNull: [{ $arrayElemAt: ["$total.count", 0] }, 0]
                    },
                    byStatus: {
                        $arrayToObject: {
                            $map: {
                                input: "$byStatus",
                                as: "item",
                                in: {
                                    k: "$$item._id",
                                    v: "$$item.count"
                                }
                            }
                        }
                    },
                    byPriority: {
                        $arrayToObject: {
                            $map: {
                                input: "$byPriority",
                                as: "item",
                                in: {
                                    k: "$$item._id",
                                    v: "$$item.count"
                                }
                            }
                        }
                    },
                    overdue: {
                        $ifNull: [{ $arrayElemAt: ["$overdue.count", 0] }, 0]
                    }
                }
            }
        ]).toArray();

        if(totalRec){
            res.status(200).json({
                status: "Success",
                message: "Data fetch successfully",
                data: totalRec
            })
        } else {
            res.status(500).json({
                status: "Failed",
                message: "There is some issue with total fetch"
            })
        }

    } catch (err) {
            res.status(500).send("There is some issue with total fetch" + err);
    }

});

app.listen(8000, () => {
    console.log("app is running on port 8000");
})

