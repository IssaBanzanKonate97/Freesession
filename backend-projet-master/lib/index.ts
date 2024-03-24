import "dotenv/config";
import express from "express";
import Booking from "./services/Booking";
import PractitionerService from "./services/Practitioner";
import { ContactService } from "./services/Contact/contact.service";
import Database from "./services/Database";
import axios from 'axios';
import crypto from 'crypto';
const moment = require('moment-timezone');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

import cors from 'cors';

const port = process.env.PORT || 3000;

if (!port) {
  console.error("La variable d'environnement PORT n'est pas définie.");
  process.exit(1);
}

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/calendars/all", async (req, res) => {
  const booking = new Booking();
  return await booking.getCalendarsIdsFromAppointmentTypeId(req, res);
});

app.get("/fetch_appointment_dates", async (req, res) => {
  const booking = new Booking();
  await booking.fetchAppointmentDates(req, res);
});

app.get("/fetch_appointment_times", async (req, res) => {
  const booking = new Booking();
  await booking.fetchAppointmentTimes(req, res);
});

/*app.get("/practitioners", async (req, res) => {
  try {
    const practitionerService = new PractitionerService();
    const practitioners = await practitionerService.getAllPractitioners(); // Cette méthode doit être implémentée
    res.json(practitioners);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur lors de la récupération des praticiens.");
  }
});*/

app.post("/api/become-practitioner", async (req, res) => {
  const practitionerService = new PractitionerService();
  await practitionerService.handle(req, res);
});

app.get("/appointment-types/all", async (req, res) => {
  const booking = new Booking();
  try {
    const appointmentTypes = await booking.getAllAppointmentTypes();
    res.json(appointmentTypes);
  } catch (error) {
    res.status(500).send(error.toString());
  }
});

app.post('/api/book-appointment', async (req, res) => {
  console.log(`req1 = ${req.body}`)
  console.log(`req2 = ${JSON.stringify(req.body)}`)
  const booking = new Booking();
  await booking.createAppointment(req, res);
});

app.get('/', (req, res) => {
  const links = [];
  app._router.stack.forEach(function (route) {
    if (route.route && route.route.path && route.route.path !== '/') {
      links.push(`<a href='${route.route.path}'>${route.route.path}</a>`);
    }
  });
  return res.send(`API fonctionne<br>${links.join('<br>')}`);
});

app.post('/login', async (req, res) => {
  console.log(`req1 = ${req.body}`)
  console.log(`req2 = ${JSON.stringify(req.body)}`)
  const bookingService = new Booking();
  await bookingService.loginUser(req, res);
});



//app.get('/api/clients', async (req, res) => {
// const booking = new Booking();
// await booking.getAllClients(req, res);
//});


app.put('/api/user/:acuityUserId', async (req, res) => { // Mettre à jour les informations du client dans la base de données et dans Acuity
  const { acuityUserId } = req.params;
  const { Lastname: lastName, Firstname: firstName, Mail: email, Mobile: phone } = req.body;

  try {
    const db = new Database();
    await db.updateUser(Number(acuityUserId), firstName, lastName, email, phone);

    const booking = new Booking();
    const acuityResponse = await booking.updateClientInAcuity(Number(acuityUserId), firstName, lastName, email, phone);

    res.json({ message: 'Les informations du client ont été mises à jour avec succès.', data: acuityResponse });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du client :', error);
    
    if (axios.isAxiosError(error) && error.response) {
      res.status(error.response.status).json({ message: 'Erreur lors de la mise à jour avec l\'API Acuity', details: error.response.data });
    } else {
      res.status(500).json({ message: 'Erreur interne du serveur' });
    }
  }
});



app.get('/api/user/:acuityUserId', async (req, res) => { // Récupérer les données de l'utilisateur connecté à partir de son ID Acuity pour pré-remplir le formulaire
  
  try {
    const { acuityUserId } = req.params;
    const db = new Database();
    const user = await db.findUserById(acuityUserId);
    if (user) {
      res.json(user);
    } else {
      res.status(404).send('Utilisateur non trouvé');
    }
  } catch (error) {
    console.error('Erreur lors de la récupération de l’utilisateur:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});


// Récupérer les rendez-vous d'un utilisateur connecté
app.get('/api/appointments/user/:acuityUserId', async (req, res) => {
  try {
    const { acuityUserId } = req.params;
    const db = new Database();
    const appointments = await db.getAppointmentsByUserId(Number(acuityUserId));
    res.json(appointments);
  } catch (error) {
    console.error('Error fetching appointments for user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Reprogrammer un rendez-vous
app.put('/api/appointments/:acuityUserId/reschedule', async (req, res) => {
  const { acuityUserId } = req.params;
  const { newDate, newTime } = req.body;

  // Assurez-vous d'ajuster 'Europe/Paris' au fuseau horaire souhaité
  const newDateTimeISO = moment.tz(`${newDate} ${newTime}`, 'YYYY-MM-DD HH:mm', 'Europe/Paris').toISOString();

  const authHeader = {
    'Authorization': `Basic ${Buffer.from(`${process.env.ACUITY_USER_ID}:${process.env.ACUITY_API_KEY}`).toString('base64')}`,
    'Content-Type': 'application/json'
  };

  const url = `${process.env.ACUITY_BASE_URL}/appointments/${acuityUserId}/reschedule`;

  try {
    const acuityResponse = await axios.put(url, { datetime: newDateTimeISO }, { headers: authHeader });
    const db = new Database();
    await db.updateAppointment(newDate, newTime, acuityUserId);
    res.json({ message: 'Le rendez-vous a été reprogrammé avec succès.', data: acuityResponse.data });
  } catch (error) {
    console.error('Erreur lors de la connexion à l\'API Acuity ou de la mise à jour de la base de données :', error);
    if (error.response) {
      res.status(error.response.status).json({ message: 'Erreur lors de la reprogrammation avec l\'API Acuity', details: error.response.data });
    } else {
      res.status(500).json({ message: 'Erreur interne du serveur' });
    }
  }
});

app.put('/api/appointments/:id/cancel', async (req, res) => {
  const { id } = req.params;

  const authHeader = {
    'Authorization': `Basic ${Buffer.from(`${process.env.ACUITY_USER_ID}:${process.env.ACUITY_API_KEY}`).toString('base64')}`,
    'Content-Type': 'application/json'
  };

  const url = `${process.env.ACUITY_BASE_URL}/appointments/${id}/cancel`;

  try {
    // Annuler le rendez-vous via l'API Acuity
    await axios.put(url, {}, { headers: authHeader });

    
    const db = new Database();
    await db.cancelAppointment(id); 

    res.json({ message: 'Le rendez-vous a été annulé avec succès.' });
  } catch (error) {
    console.error('Erreur lors de la connexion à l\'API Acuity ou de la mise à jour de la base de données :', error);
    if (error.response) {
      res.status(error.response.status).json({ message: 'Erreur lors d\'annulation avec l\'API Acuity', details: error.response.data });
    } else {
      res.status(500).json({ message: 'Erreur interne du serveur' });
    }
  }
});


app.post("/api/contact", async (req, res) => {

  const contactService = new ContactService();
  try {
    await contactService.sendMail(req.body);
    res.status(200).send("Message envoyé avec succès.");
  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur lors de l'envoi du message.");
  }
});

app.post('/api/payment', async (req, res) => {
  // extraire les données de paiement de la requête
  const { amount, payment_method_id: id, name, surname, email } = req.body;
  console.log('Payment', amount, id, name, surname, email); //vérification des données reçues 
  
  try {
    // Créer un paiement avec Stripe
    const paymentIntent = await stripe.paymentIntents.create({ // Création d'un paiement
      amount: amount, // Montant du paiement
      currency: 'eur', // Devise
      payment_method: id, // Méthode de paiement
      confirm: true, // Confirmation automatique
      receipt_email: email, // Email pour l'envoi du reçu
      return_url: 'https://freesession.net',
    });

    console.log('Payment successful', paymentIntent);
    res.json({ message: 'Payment successful', paymentIntent });
  } catch (error) {
    console.error('Payment error:', error);
    res.status(400).json({ message: 'paiment réjeté', error: error.message });
  }
});


app.post("/api/request-password-reset", async (req, res) => {
  const db = new Database(); 
  const { email } = req.body;
  try {
    const user = await db.findUserByEmail(email);
    if (!user) {
      return res.status(200).json({ message: 'Si un compte est associé à cet email, un lien de réinitialisation a été envoyé.' });
    }

    const token = crypto.randomBytes(20).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await db.savePasswordResetToken(email, token, expiresAt);

    // Utilisation du PasswordResetService pour envoyer l'email
    const passwordResetService = new ContactService();
    await passwordResetService.sendResetEmail(email, token);

    res.status(200).json({ message: 'Si un compte est associé à cet email, un lien de réinitialisation a été envoyé.' });
  } catch (error) {
    console.error('Erreur lors de la demande de réinitialisation du mot de passe:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

app.post('/api/reset-password', async (req, res) => {
  const db = new Database();
  const { email, token, newPassword } = req.body;

  try {
    const isValidToken = await db.verifyPasswordResetToken(email, token);
    if (!isValidToken) {
      res.status(400).send('Token de réinitialisation invalide ou expiré.');
      return;
    }

    await db.updateUserPassword(email, newPassword);
    await db.deletePasswordResetToken(token);

    res.send('Mot de passe réinitialisé avec succès.');
  } catch (error) {
    console.error('Erreur lors de la réinitialisation du mot de passe:', error);
    res.status(500).send('Erreur serveur.');
  }
});


app.post('/api/create-client', async (req, res) => {
  const booking = new Booking();
  await booking.createClient(req, res);
});


if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Serveur lancé sur le port : ${port}`);
  });
}
export default app;

