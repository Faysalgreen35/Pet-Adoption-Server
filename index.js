const express = require('express');
const cors = require('cors');
const app = express();
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;

// middleware 

app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5ynzghe.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


async function run() {
  try {

    const userCollection = client.db("petAdoptionDb").collection("users")
    const petListCollection = client.db("petAdoptionDb").collection("petLists")
    const adoptRequestCollection = client.db("petAdoptionDb").collection("adoptRequests")
    const donateCampaignCollection = client.db("petAdoptionDb").collection("donateCampaigns")
    const paymentCollection = client.db("petAdoptionDb").collection("payments")

    // JWT related api 
    app.post('/jwt', async (req, res) => {

      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d"
      })
      res.send({ token });
    })

    //middleware 
    const verifyToken = (req, res, next) => {
      console.log('inside verifyToken', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'forbidden Access' })
      }

      const token = req.headers.authorization.split(' ')[1]
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
      })

    }

    // use verify admin after verifytoken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });

      }
      next();
    }



    // user related api 
    app.get('/users/admin/:email', verifyToken, async (req, res) => {

      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'unauthorized access' })
      }

      const query = { email: email }
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user.role === 'admin';
      }
      res.send({ admin });
    })


    //users api
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {

      const result = await userCollection.find().toArray();
      res.send(result);
    })


    //create user database

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query)
      if (existingUser) {
        return res.send({ message: 'user already exist', insertedId: null })

      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })

    //make admin

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

// delete user 
    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);;
    })
    //delete a payment
    app.delete('/payment/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await paymentCollection.deleteOne(query);
      res.send(result);;
    })



    // all pets 
    app.get('/allPets', async (req, res) => {
      // const result = await petListCollection.find().toArray();
      // res.send(result);
      try {
        const sortBy = req.query.sortBy; // Field to sort by
        const sortDirection = req.query.sortDirection || 'asc'; // Sort direction (default: ascending)

        const sortQuery = {};
        sortQuery[sortBy] = sortDirection === 'desc' ? -1 : 1; // Sort direction

        // Fetch and sort pet lists
        const result = await petListCollection.find().sort(sortQuery).toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching pet lists:", error);
        res.status(500).send("Internal Server Error");
      }
    })

    // all pets 
    app.get('/all-donate', async (req, res) => {

      try {
        const sortBy = req.query.sortBy; // Field to sort by
        const sortDirection = req.query.sortDirection || 'asc'; // Sort direction (default: ascending)

        const sortQuery = {};
        sortQuery[sortBy] = sortDirection === 'desc' ? -1 : 1; // Sort direction

        // Fetch and sort pet lists
        const result = await donateCampaignCollection.find().sort(sortQuery).toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching pet lists:", error);
        res.status(500).send("Internal Server Error");
      }
    })

    // petlists related api

    // app.get('/petLists', async (req, res) => {
    //   const result = await petListCollection.find().toArray();
    //   res.send(result);
    // })

    // petlists related API
    // app.get('/petLists', async (req, res) => {
    //   const limit = parseInt(req.query.limit) || 3; // Default limit to 3 items
    //   const offset = parseInt(req.query.offset) || 0;
    //   const result = await petListCollection.find().skip(offset).limit(limit).toArray();
    //   res.send(result);
    // });

    // petlists related API
    app.get('/petLists', async (req, res) => {
      const limit = parseInt(req.query.limit) || 3; // Default limit to 3 items
      const offset = parseInt(req.query.offset) || 0;
      let query = {};

      // Search by name
      if (req.query.name) {
        query.name = { $regex: req.query.name, $options: 'i' }; // Case-insensitive regex search
      }

      // Filter by category
      if (req.query.category) {
        query.category = req.query.category;
      }
      try {
        const result = await petListCollection.find(query)
          .sort({ createdDate: -1 }) // Sort by createdDate in descending order
          .skip(offset)
          .limit(limit)
          .toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'An error occurred', error: err });
      }
    });

    // // GET API endpoint to retrieve pet lists for a specific user
    // app.get('/petListEmail', async (req, res) => {
    //   const email = req.query.email;
    //   const query = { createdBy: email };
    //   const result = await petListCollection.find(query).toArray();
    //   res.send(result);
    // })

    // GET API endpoint to retrieve pet lists for a specific user with sorting
    app.get('/petListEmail', async (req, res) => {
      try {
        const email = req.query.email;
        const sortBy = req.query.sortBy; // Field to sort by
        const sortDirection = req.query.sortDirection || 'asc'; // Sort direction (default: ascending)

        // Construct query
        const query = { createdBy: email };
        const sortQuery = {};
        sortQuery[sortBy] = sortDirection === 'desc' ? -1 : 1; // Sort direction

        // Fetch and sort pet lists
        const result = await petListCollection.find(query).sort(sortQuery).toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching pet lists:", error);
        res.status(500).send("Internal Server Error");
      }
    });


    // update  petList

    app.patch('/petList/:id', async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {

          name: item.name,
          age: item.age,
          category: item.category,
          location: item.location,
          shortDescription: item.shortDescription,
          longDescription: item.longDescription,
          image: item.image,
        }
      }
      const result = await petListCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    // // adopted value become true
    // app.put('/petList/:id',verifyToken, async (req, res) => {
    //   const id = req.params.id;
    //   const adoptedValue = req.body.adopted; // Assuming the request body contains the adopted field

    //   const filter = { _id: new ObjectId(id) };
    //   const updatedDoc = {
    //     $set: {
    //       adopted: adoptedValue
    //     }
    //   };

    //   const result = await petListCollection.updateOne(filter, updatedDoc);

    //   res.send(result);
    // });

    // adopted value become true
    app.put('/petList/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const adoptedValue = req.body.adopted;

        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            adopted: adoptedValue
          }
        };

        const result = await petListCollection.updateOne(filter, updatedDoc);
        res.send(result);
      } catch (error) {
        console.error('Error updating adoption status:', error);
        res.status(500).send('Error updating adoption status');
      }
    });

    app.put('/donate/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const adoptedValue = req.body.adopted;

        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            adopted: adoptedValue
          }
        };

        const result = await donateCampaignCollection.updateOne(filter, updatedDoc);
        res.send(result);
      } catch (error) {
        console.error('Error updating adoption status:', error);
        res.status(500).send('Error updating adoption status');
      }
    });




    // pet list save to database
    app.post('/petList', async (req, res) => {
      const item = req.body;
      const result = await petListCollection.insertOne(item);;
      res.send(result);
    })

    // pet list by id
    app.get('/petList/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await petListCollection.findOne(query)
      res.send(result);
    })




    app.get('/petList/:id', async (req, res) => {
      const id = req.params.id;

      // Validate ObjectId
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: 'Invalid ObjectId format' });
      }

      try {
        const query = { _id: new ObjectId(id) };
        const result = await petListCollection.findOne(query);

        if (!result) {
          return res.status(404).send({ error: 'Pet not found' });
        }

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Internal Server Error' });
      }
    });

    // my donations 
    app.get('/donationByEmail', async (req, res) => {
      try {
        const email = req.query.email;
        const sortBy = req.query.sortBy; // Field to sort by
        const sortDirection = req.query.sortDirection || 'asc'; // Sort direction (default: ascending)

        // Construct query
        const query = { email: email };
        const sortQuery = {};
        sortQuery[sortBy] = sortDirection === 'desc' ? -1 : 1; // Sort direction

        // Fetch and sort pet lists
        const result = await paymentCollection.find(query).sort(sortQuery).toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching pet lists:", error);
        res.status(500).send("Internal Server Error");
      }
    });



    // delete a data of petList
    app.delete('/petList/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await petListCollection.deleteOne(query);
      res.send(result);

    })
    // delete a data of donate campaign
    app.delete('/donate/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await donateCampaignCollection.deleteOne(query);
      res.send(result);

    })

    // adopt request save to database
    app.post('/adoptRequests', async (req, res) => {
      const item = req.body;
      const result = await adoptRequestCollection.insertOne(item);;
      res.send(result);
    })

    app.get('/adoptRequests', async (req, res) => {
      const limit = parseInt(req.query.limit) || 10;
      const offset = parseInt(req.query.offset) || 0;
      let query = {};

      try {
        const result = await adoptRequestCollection.find(query)

          .skip(offset)
          .limit(limit)
          .toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'An error occurred', error: err });
      }
    });


    // app.get('/userAdoptionRequests', async (req, res) => {
    //   try {

    //     const result = await adoptRequestCollection.aggregate{[]}
    //     const db = client.db('petAdoptionDb');
    //     const petListCollection = db.collection('petLists');
    //     const adoptRequestCollection = db.collection('adoptRequests');

    //     const currentUserEmail = req.query.email; // Assuming the logged-in user's email is sent as a query parameter

    //     const pipeline = [
    //       // Match documents where createdBy field matches the currently logged in user
    //       {
    //         $match: {
    //           createdBy: currentUserEmail
    //         }
    //       },
    //       // Lookup to join with adoptRequestCollection based on petId
    //       {
    //         $lookup: {
    //           from: "adoptRequestCollection",
    //           localField: "_id",
    //           foreignField: "petId",
    //           as: "adoptionRequests"
    //         }
    //       },
    //       // Unwind the adoptionRequests array
    //       {
    //         $unwind: "$adoptionRequests"
    //       },
    //       // Project to show only necessary fields from both collections
    //       {
    //         $project: {
    //           _id: 0,
    //           petId: "$_id",
    //           petName: "$name",
    //           userName: "$adoptionRequests.userName",
    //           userEmail: "$adoptionRequests.userEmail",
    //           phoneNumber: "$adoptionRequests.phoneNumber",
    //           location: "$adoptionRequests.address"
    //         }
    //       }
    //     ];

    //     const result = await petListCollection.aggregate(pipeline).toArray();

    //     res.status(200).json(result);
    //   } catch (error) {
    //     console.error('Error retrieving adoption requests:', error);
    //     res.status(500).json({ message: 'Internal server error' });
    //   }
    // });



    // donate collection save to database

    // app.get('/userAdoptionRequests', async (req, res) => {
    //   try {
    //     const currentUserEmail = req.params.email; // Assuming the user's email is available in req.params.email after authentication

    //     const pipeline = [
    //       {
    //         $match: {
    //           createdBy: currentUserEmail
    //         }
    //       },
    //       {
    //         $lookup: {
    //           from: "petListCollection",
    //           localField: "petId",
    //           foreignField: "_id",
    //           as: "petDetails"
    //         }
    //       },
    //       {
    //         $unwind: "$petDetails"
    //       },
    //       {
    //         $project: {
    //           _id: 0,
    //           petName: "$petDetails.name",
    //           userName: 1,
    //           userEmail: 1,
    //           phoneNumber: 1,
    //           location: 1
    //         }
    //       }
    //     ];

    //     const result = await adoptRequestCollection.aggregate(pipeline).toArray();
    //     res.json(result);
    //   } catch (error) {
    //     console.error('Error fetching adoption requests:', error);
    //     res.status(500).json({ message: 'Internal server error' });
    //   }
    // });
    // app.get('/userAdoptionRequests

    //userAdoptionRequests

    app.get('/adoptRequests', async (req, res) => {
      try {
        const email = req.query.email;
        const sortBy = req.query.sortBy; // Field to sort by
        const sortDirection = req.query.sortDirection || 'asc'; // Sort direction (default: ascending)

        // Construct query
        const query = { userEmail: email };
        const sortQuery = {};
        sortQuery[sortBy] = sortDirection === 'desc' ? -1 : 1; // Sort direction

        // Fetch and sort pet lists
        const result = await adoptRequestCollection.find(query).sort(sortQuery).toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching pet lists:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    // donate save to database
    app.post('/donate', async (req, res) => {
      const cartItem = req.body;
      const result = await donateCampaignCollection.insertOne(cartItem)
      res.send(result);
    })

    // app.get('/donate', async (req, res) => {
    //       const result = await donateCampaignCollection.find().toArray();
    //       res.send(result);
    //     })

    // fetch donate data
    app.get('/donate', async (req, res) => {
      const limit = parseInt(req.query.limit) || 3;
      const offset = parseInt(req.query.offset) || 0;
      let query = {};

      try {
        const result = await donateCampaignCollection.find(query)
          .sort({ createdDate: -1 })
          .skip(offset)
          .limit(limit)
          .toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'An error occurred', error: err });
      }
    });


    app.get('/donate/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await donateCampaignCollection.findOne(query)
      res.send(result);
    })



    // donate by email
    app.get('/DonateByEmail', async (req, res) => {
      try {
        const email = req.query.email;
        const sortBy = req.query.sortBy; // Field to sort by
        const sortDirection = req.query.sortDirection || 'asc'; // Sort direction (default: ascending)

        // Construct query
        const query = { createdBy: email };
        const sortQuery = {};
        sortQuery[sortBy] = sortDirection === 'desc' ? -1 : 1; // Sort direction

        // Fetch and sort pet lists
        const result = await donateCampaignCollection.find(query).sort(sortQuery).toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching pet lists:", error);
        res.status(500).send("Internal Server Error");
      }
    });


    app.patch('/donate/:id', async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {

          name: item.name,
          maximumDonationAmount: item.maximumDonationAmount,
          lastDate: item.lastDate,
          shortDescription: item.shortDescription,
          longDescription: item.longDescription,
          image: item.image,
        }
      }
      const result = await donateCampaignCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })




    // payment intetnt
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      })

    })

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      // carefully delete each item from the cart
      console.log('payment info', payment);
      // const query = {_id: {
      //   $in: payment.cartIds.map(id => new ObjectId(id))
      // }};

      // const deleteResult = await cartCollection.deleteMany(query);
      res.send({ paymentResult });

    })

    //stats or analytics
    //   app.get('/admin-stats',verifyToken,verifyAdmin,async(req,res)=>{
    //     const users = await userCollection.estimatedDocumentCount();
    //     const menuItems = await menuCollection.estimatedDocumentCount();
    //     const orders = await paymentCollection.estimatedDocumentCount();

    //     // this not the best way
    //     // const payments = await paymentCollection.find().toArray();
    //     // const revenue = payments.reduce((total, payment) =>total + payment.price, 0)

    //     const result = await paymentCollection.aggregate([
    //       {
    //         $group: {
    //           _id: null,
    //           totalRevenue: {
    //             $sum:'$price'
    //           }
    //         }
    //       }
    //     ]).toArray();

    //     const revenue = result.length > 0 ? result[0].totalRevenue: 0;


    //     res.send({
    //       users,
    //       menuItems,
    //       orders,
    //       revenue
    //     })
    //   })

    //   app.get('/payments/:email',verifyToken, async(req, res)=>{
    //     const query = {email: req.params.email}
    //     if(req.params.email !== req.decoded.email){
    //       return res.status(403).send({message:'forbidden access'})
    //     }
    //     const result = await paymentCollection.find(query).toArray();
    //     res.send(result);
    //   })
    // src/pages/Dashboard/Payment/__payment_steps__.js

    // using aggregate pipeline

    //   app.get('/order-stats',verifyToken,verifyAdmin, async(req, res) =>{
    //     const result = await paymentCollection.aggregate([
    //       {
    //         $unwind: '$menuItemIds'
    //       },
    //       {
    //         $lookup:{
    //           from:'menu',
    //           localField:'menuItemIds',
    //           foreignField:'_id',
    //           as:'menuItems'
    //         }
    //       },
    //       {
    //         $unwind: '$menuItems'
    //       },
    //       {
    //         $group:{
    //           _id: '$menuItems.category',
    //           quantity:{ $sum:1},
    //           revenue:{$sum: '$menuItems.price'}
    //         }
    //       },
    //       {
    //         $project: {
    //           _id:0,
    //           category:'$_id',
    //           quantity: '$quantity',
    //           revenue: '$revenue'
    //         }
    //       }
    //     ]).toArray();

    //     res.send(result)

    //   })

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Pet Adoption server is running')
})

app.listen(port, () => {
  console.log(`Pet Adoption is sitting on port ${port}`)
})
