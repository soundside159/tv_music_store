import { useState } from "react";
import { motion } from "framer-motion";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const Footer = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    toast({
      title: "Message sent!",
      description: "We'll get back to you soon.",
    });
    
    setName("");
    setEmail("");
    setMessage("");
    setIsSubmitting(false);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
      },
    },
  };

  return (
    <footer id="contact" className="py-20 bg-card border-t border-border/50">
      <div className="container mx-auto px-6">
        <motion.div 
          className="max-w-2xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
        >
          {/* Header */}
          <motion.div className="text-center mb-10" variants={itemVariants}>
            <h2 className="font-display text-3xl md:text-4xl text-gradient-gold mb-4 tracking-wide">
              Let's Create Together
            </h2>
            <p className="font-body text-base md:text-lg text-muted-foreground">
              Need a custom composition or track adaptation for your project?
            </p>
          </motion.div>

          {/* Contact Form */}
          <motion.form 
            onSubmit={handleSubmit} 
            className="space-y-6"
            variants={itemVariants}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="name" className="block font-body text-sm text-foreground mb-2">
                  Name
                </label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="bg-background/50 border border-border/50 focus:border-primary focus:ring-0 focus:outline-none transition-colors duration-300"
                />
              </div>
              <div>
                <label htmlFor="email" className="block font-body text-sm text-foreground mb-2">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="bg-background/50 border border-border/50 focus:border-primary focus:ring-0 focus:outline-none transition-colors duration-300"
                />
              </div>
            </div>
            
            <div>
              <label htmlFor="message" className="block font-body text-sm text-foreground mb-2">
                Message
              </label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us about your project..."
                required
                rows={5}
                className="bg-background/50 border border-border/50 focus:border-primary focus:ring-0 focus:outline-none transition-colors duration-300 resize-none"
              />
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full md:w-auto px-8 py-3 bg-primary text-primary-foreground 
                       hover:bg-primary/90 transition-all duration-300 font-body"
            >
              {isSubmitting ? (
                "Sending..."
              ) : (
                <>
                  Send Message
                  <Send className="ml-2 w-4 h-4" />
                </>
              )}
            </Button>
          </motion.form>
        </motion.div>

        {/* Copyright */}
        <motion.div 
          className="border-t border-border/50 mt-16 pt-8"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
        >
          <p className="font-body text-xs text-muted-foreground text-center">
            © 2026 TVMUSICSTORE. All rights reserved.
          </p>
        </motion.div>
      </div>
    </footer>
  );
};

export default Footer;