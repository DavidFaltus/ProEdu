import React from 'react';
import { motion } from 'motion/react';
import { MapPin, Send, Clock } from 'lucide-react';
import { MailBlueIcon, PhonePinkIcon } from '../components/common/CustomIcon';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent } from '../components/ui/card';
import { toast } from 'sonner';

export default function Contact() {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Zpráva byla odeslána. Brzy se vám ozveme!');
  };

  return (
    <div className="space-y-8 md:space-y-10">
      <section className="text-center space-y-4 sm:space-y-6 max-w-3xl mx-auto">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-playful text-gray-700 tracking-tight"
        >
          Budeme v <span className="text-brand-orange">kontaktu</span>
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-base sm:text-xl text-gray-500 leading-relaxed"
        >
          Máte dotaz k našim kurzům nebo aplikaci? Napište nám nebo zavolejte. 
          Jsme tu pro vás každý pracovní den.
        </motion.p>
      </section>

      <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-8"
        >
          <div className="grid sm:grid-cols-2 gap-6">
            <Card className="rounded-3xl border-none shadow-lg bg-white p-6 space-y-4">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-brand-blue">
                <MailBlueIcon size={26} />
              </div>
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">E-mail</div>
                <a href="mailto:info@pro-edu.eu" className="text-lg font-bold text-gray-800 hover:text-brand-blue hover:underline break-all">
                  info@pro-edu.eu
                </a>
              </div>
            </Card>
            <Card className="rounded-3xl border-none shadow-lg bg-white p-6 space-y-4">
              <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-brand-orange">
                <PhonePinkIcon size={26} />
              </div>
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Telefon</div>
                <a href="tel:+420123456789" className="text-lg font-bold text-gray-800 hover:text-brand-orange hover:underline">
                  +420 123 456 789
                </a>
              </div>
            </Card>
            <Card className="rounded-3xl border-none shadow-lg bg-white p-6 space-y-4">
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-brand-purple">
                <MapPin size={24} />
              </div>
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Adresa</div>
                <div className="text-lg font-bold text-gray-800">Praha, Česká republika</div>
              </div>
            </Card>
            <Card className="rounded-3xl border-none shadow-lg bg-white p-6 space-y-4">
              <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center text-green-600">
                <Clock size={24} />
              </div>
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Pracovní doba</div>
                <div className="text-lg font-bold text-gray-800">Po - Pá: 9:00 - 17:00</div>
              </div>
            </Card>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="rounded-[2.5rem] sm:rounded-[3rem] border-none shadow-2xl bg-white overflow-hidden">
            <div className="h-4 bg-brand-orange" />
            <CardContent className="p-5 sm:p-8 md:p-10 space-y-6 sm:space-y-8">
              <div className="space-y-2">
                <h2 className="text-3xl font-sans font-bold text-gray-900">Napište nám</h2>
                <p className="text-gray-500">Vyplňte formulář a my se vám ozveme co nejdříve.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="font-bold text-gray-700 ml-1">Jméno</Label>
                    <Input id="name" placeholder="Jan Novák" className="rounded-2xl h-12 border-gray-100 bg-gray-50 focus:bg-white transition-all" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="font-bold text-gray-700 ml-1">E-mail</Label>
                    <Input id="email" type="email" placeholder="jan@novak.cz" className="rounded-2xl h-12 border-gray-100 bg-gray-50 focus:bg-white transition-all" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject" className="font-bold text-gray-700 ml-1">Předmět</Label>
                  <Input id="subject" placeholder="Dotaz ke kurzu" className="rounded-2xl h-12 border-gray-100 bg-gray-50 focus:bg-white transition-all" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message" className="font-bold text-gray-700 ml-1">Zpráva</Label>
                  <Textarea id="message" placeholder="Jak vám můžeme pomoci?" className="rounded-2xl min-h-[150px] border-gray-100 bg-gray-50 focus:bg-white transition-all" required />
                </div>
                <Button type="submit" className="w-full btn-orange h-14 rounded-2xl text-lg font-bold gap-2">
                  Odeslat zprávu <Send size={20} />
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
